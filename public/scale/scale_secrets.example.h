#pragma once
// Copy to .scale-secrets.h at the project root; never put secrets in public/.
constexpr bool LOCAL_HTTP_TEST = true; // false for verified production HTTPS
const char* WIFI_SSID = "YOUR_2_4_GHZ_SSID";
const char* WIFI_PASSWORD = "REPLACE_LOCALLY";
const char* API_URL = "http://192.168.1.5:5173/api/scale-reading";
const char* DEVICE_TOKEN = "REPLACE_LOCALLY_FROM_DEV_VARS";
// Required in HTTPS mode: actual PEM root CA for the chosen deployment.
const char* ROOT_CA = "";
