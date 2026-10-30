// D Loop 3D USB NFC scale prototype. NOT hardware-tested or compile-verified.
// Target: classic ESP32-WROOM DevKit. Arduino libraries: HX711 (bogde),
// Adafruit PN532 + its Adafruit BusIO dependency. See setup.md before wiring.
#include <Arduino.h>
#include <HX711.h>
#include <Adafruit_PN532.h>
#include <Preferences.h>
#include <math.h>
HX711 scale;
// Software SPI: SCK, MISO, MOSI, SS. Set PN532 module switches to SPI.
Adafruit_PN532 nfc(18, 19, 23, 5);
Preferences prefs;
float factor=0;
bool zeroed=false, nfcOK=false;
float samples[8];
int count=0, cursor=0;
String lastUID="", command="";
void resetWindow(){count=0;cursor=0;}
void process(String cmd){
 cmd.trim();
 if(cmd=="tare"){
  // Operator must remove ALL objects first. Never auto-tare on boot.
  if(!scale.wait_ready_timeout(1000)){Serial.println("# HX711 not ready");return;}
  scale.tare(10);zeroed=true;resetWindow();Serial.println("# Empty platform zero saved for this session");
 }else if(cmd.startsWith("cal ")){
  float grams=cmd.substring(4).toFloat();
  if(!zeroed||grams<=0||grams>5000){Serial.println("# Tare empty platform first; then cal <known grams>");return;}
  if(!scale.wait_ready_timeout(1000))return;
  float result=scale.get_value(10)/grams;
  if(!isfinite(result)||fabs(result)<0.001){Serial.println("# Calibration failed");return;}
  factor=result;scale.set_scale(factor);prefs.putFloat("factor",factor);resetWindow();Serial.println("# Calibration factor saved. Check a second known weight.");
 }else Serial.println("# Commands: tare | cal 500 (replace 500 with known grams)");
}
void setup(){
 Serial.begin(115200);Serial.println("# D Loop 3D prototype USB scale");
 prefs.begin("dloop",false);factor=prefs.getFloat("factor",0);
 scale.begin(26,27);if(factor!=0)scale.set_scale(factor);
 nfc.begin();nfcOK=nfc.getFirmwareVersion()!=0;
 if(nfcOK){nfc.SAMConfig();nfc.setPassiveActivationRetries(0x01);}
 else Serial.println("# PN532 missing. Check wiring and SPI mode.");
 Serial.println("# Remove all objects, send tare. For first calibration place known weight, send cal 500.");
}
void loop(){
 while(Serial.available()){
  char c=Serial.read();if(c=='\n'){process(command);command="";}else if(c!='\r'){command+=c;if(command.length()>80)command="";}
 }
 if(!zeroed||factor==0||!nfcOK){delay(20);return;}
 if(!scale.wait_ready_timeout(500)){resetWindow();return;}
 float gross=scale.get_units(1);
 if(!isfinite(gross)){resetWindow();return;}
 uint8_t uid[10],len=0;
 if(!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A,uid,&len,100)||!(len==4||len==7||len==10)){
  lastUID="";resetWindow();return;
 }
 String tag="";for(uint8_t i=0;i<len;i++){if(uid[i]<16)tag+="0";tag+=String(uid[i],HEX);}tag.toUpperCase();
 if(lastUID!=tag){lastUID=tag;resetWindow();}
 samples[cursor]=gross;cursor=(cursor+1)%8;if(count<8)count++;
 float lo=samples[0],hi=samples[0],sum=0;
 for(int i=0;i<count;i++){lo=min(lo,samples[i]);hi=max(hi,samples[i]);sum+=samples[i];}
 // A stability heuristic, not a guarantee of accuracy. Tune after physical testing.
 bool stable=count==8 && hi-lo<=2.0 && gross>=0 && gross<=5000;
 float mean=sum/count;
 if(mean>=0 && mean<=5000){
  Serial.print("{\"uid\":\"");Serial.print(tag);Serial.print("\",\"gross\":");Serial.print(mean,1);
  Serial.print(",\"stable\":");Serial.print(stable?"true":"false");Serial.println("}");
 }
 delay(200);
}
