#pragma once
#include "esp_wifi_types.h"

// Called by ws_client when connection is ready
typedef void (*csi_frame_cb_t)(const char *json_frame, size_t len);

void csi_capture_init(uint8_t channel, csi_frame_cb_t on_frame);
void csi_capture_deinit(void);
