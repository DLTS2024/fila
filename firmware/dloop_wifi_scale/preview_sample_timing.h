#pragma once
#include <stdint.h>
namespace PreviewSampleTiming {
constexpr uint32_t age(uint32_t initial,uint32_t elapsed){
 return uint64_t(initial)+elapsed>UINT32_MAX?UINT32_MAX:uint32_t(initial+elapsed);
}
constexpr bool fresh(uint32_t initial,uint32_t elapsed){return age(initial,elapsed)<=500;}
constexpr bool after(uint32_t sample,uint32_t requested){return int32_t(sample-requested)>0;}
}
