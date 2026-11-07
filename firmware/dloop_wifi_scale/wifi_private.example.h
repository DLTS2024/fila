#pragma once
// Copy outside version control as wifi_private.h ONLY after approval.
// Obtain the device token privately from device-credential.php, never a DB password.
#define DLOOP_WIFI_SSID ""
#define DLOOP_WIFI_PASSWORD ""
#define DLOOP_DEVICE_TOKEN ""
#define DLOOP_SCALE_ENDPOINT "https://fila.dlts.in/api/v1/device/scale-reading"
// PEM of the independently verified CA for fila.dlts.in's actual TLS chain.
// No trust anchor is guessed while hosting is unreachable. Empty = fail closed.
#define DLOOP_TLS_CA_PEM ""
