#include "runtime.h"
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
static void overflow(void) { fputs("integer overflow: native bignum promotion is not supported by --native yet\n", stderr); exit(1); }
static void zero(void) { fputs("division by zero\n", stderr); exit(1); }
int64_t mx_add(int64_t a,int64_t b) { int64_t r; if(__builtin_add_overflow(a,b,&r)) overflow(); return r; }
int64_t mx_sub(int64_t a,int64_t b) { int64_t r; if(__builtin_sub_overflow(a,b,&r)) overflow(); return r; }
int64_t mx_mul(int64_t a,int64_t b) { int64_t r; if(__builtin_mul_overflow(a,b,&r)) overflow(); return r; }
int64_t mx_div(int64_t a,int64_t b) { if(!b) zero(); if(a==INT64_MIN && b==-1) overflow(); return a/b; }
int64_t mx_mod(int64_t a,int64_t b) { if(!b) zero(); if(a==INT64_MIN && b==-1) return 0; return a%b; }
int64_t mx_neg(int64_t a) { if(a==INT64_MIN) overflow(); return -a; }
void mx_print_int(int64_t a) { printf("%" PRId64 "\n",a); }
void mx_print_bool(bool a) { puts(a ? "true" : "false"); }
