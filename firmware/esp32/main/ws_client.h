#pragma once
#include <stddef.h>
#include <stdint.h>

void ws_client_start(const char *server_ip, uint16_t port);
void ws_client_send(const char *data, size_t len);
int  ws_client_is_connected(void);
