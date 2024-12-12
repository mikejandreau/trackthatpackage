const axios = require('axios');

// Token cache variables
let cachedToken = null;
let tokenExpiration = null;

// Function to fetch or reuse the access token
const getAccessToken = async () => {
    if (cachedToken && Date.now() < tokenExpiration) {
        console.log('Using cached access token.');
        return cachedToken;
    }

    console.log('Fetching new access token...');
    try {
        const tokenResponse = await axios.post(
            'https://wwwcie.ups.com/security/v1/oauth/token',
            new URLSearchParams({ grant_type: 'client_credentials' }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                auth: {
                    username: process.env.UPS_CLIENT_ID,
                    password: process.env.UPS_CLIENT_SECRET,
                },
            }
        );

        cachedToken = tokenResponse.data.access_token;
        tokenExpiration = Date.now() + tokenResponse.data.expires_in * 1000; // expires_in is in seconds
        console.log('New token fetched and cached.');
        return cachedToken;
    } catch (error) {
        console.error('Error fetching access token:', error.response?.data || error.message);
        throw new Error('Failed to fetch access token.');
    }
};

exports.handler = async (event) => {
    console.log("Track.js loaded and function execution started.");
    console.log('Received request:', event.body);

    try {
        const { trackingNumbers } = JSON.parse(event.body);
        console.log('Tracking Numbers:', trackingNumbers);

        if (!trackingNumbers || trackingNumbers.length === 0) {
            console.error('No tracking numbers provided.');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No tracking numbers provided.' }),
            };
        }

        // Step 1: Get the access token
        const accessToken = await getAccessToken();
        console.log('Access Token:', accessToken);

        // Step 2: Fetch tracking details
        const trackingResults = await Promise.all(
            trackingNumbers.map(async (trackingNumber) => {
                try {
                    console.log('Fetching details for tracking number:', trackingNumber);

                    const trackingResponse = await axios.get(
                        `https://onlinetools.ups.com/track/v1/details/${trackingNumber}`,
                        {
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                                'Content-Type': 'application/json',
                            },
                        }
                    );

                    console.log('Tracking API response:', trackingResponse.data);

                    return {
                        trackingNumber,
                        status: trackingResponse.data.trackResponse.shipment[0]?.package[0]?.activity[0]?.status?.description || 'Unknown status',
                        eta: trackingResponse.data.trackResponse.shipment[0]?.package[0]?.activity[0]?.date || 'Unknown ETA',
                    };
                } catch (err) {
                    console.error('Error fetching tracking details for:', trackingNumber);
                    console.error('Error details:', JSON.stringify(err.response?.data || err.message, null, 2));

                    return {
                        trackingNumber,
                        error: err.response?.data?.errors || 'Failed to fetch details.',
                    };
                }
            })
        );

        return {
            statusCode: 200,
            body: JSON.stringify(trackingResults),
        };

    } catch (err) {
        console.error('Unexpected error:', err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: err.message }),
        };
    }
};
