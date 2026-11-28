#ifndef MYCEL_NATIVE_RUNTIME_H
#define MYCEL_NATIVE_RUNTIME_H
#include <stdint.h>
#include <stdbool.h>
int64_t mx_add(int64_t, int64_t);
int64_t mx_sub(int64_t, int64_t);
int64_t mx_mul(int64_t, int64_t);
int64_t mx_div(int64_t, int64_t);
int64_t mx_mod(int64_t, int64_t);
int64_t mx_neg(int64_t);
void mx_print_int(int64_t);
void mx_print_bool(bool);
#endif
