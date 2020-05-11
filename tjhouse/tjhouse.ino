//Author: Jiri Petnik, IBM
//Email: jiri_petnik@cz.ibm.com
//
//TJBot house: 
//      Publishes sensor data to IBM Bluemix
//              - temperature
//              - humidity 
//              - heatIndex
//              - RGB diode color 
//              - door status
//      Subscribes to command topic and change RGB diode color and close/open the door   

//MQTT
#include <SPI.h>
#include <PubSubClient.h>
#include <Ethernet2.h>

//servo
#include <Servo.h>
Servo door;

//LCD
#include <LiquidCrystal.h>
////const int rs = A5, en = A4, d4 = A3, d5 = A2, d6 = A1, d7 = A0;
////LiquidCrystal lcd(rs, en, d4, d5, d6, d7);
LiquidCrystal lcd(A0, A1, A2, A3, A4, A5);

#include <util.h>
#define ETH_CS  10
#define SD_CS  4

//DHT22
#include "DHT.h"
#define DHTPIN 2
#define DHTTYPE DHT22 
DHT dht(DHTPIN, DHTTYPE);

//RGB diode pins
#define PIN_R  9
#define PIN_G  8
#define PIN_B  7


//==========================================================================
//======================== REQUIRED CONFIGURATION ==========================
//==========================================================================
/*
 * Publish interval
 */
int publishInterval = 5000; // 5 seconds
long lastPublishMillis;


/*
 * Arduino MAC address - it can be copied from Ethernet shield
 * if the MAC is e.g. 90A2DA10BF3B, then fill mac[] array as: {0x90, 0xA2, 0xDA, 0x10, 0xBF, 0x3B}
 */
byte _mac[] = {0x90, 0xA2, 0xDA, 0x10, 0xBF, 0x3B};


/*
 * Watson IoT Platform information
 * --------------------------------------------------------------------
 * <org>        - organization ID
 * <deviceType> - device type
 * <deviceId>   - device ID
 * <authToken>  - authentication token
 * 
 * <evtTopic>   - event topic which the data is sent to (e.g. status)
 * <cmdTopic>   - command topic which the client is subscribed to (e.g. ard-cmd)
*/

// const char _serverStr[]    = "<org>.messaging.internetofthings.ibmcloud.com";
// const char _clientStr[]    = "d:<org>:<deviceType>:<deviceId>";
// const char _tokenStr[]     = "<authToken>";
// const char _evtTopicStr[]  = "iot-2/evt/<evtTopic>/fmt/json";
// const char _cmdTopicStr[]  = "iot-2/cmd/<cmdTopic>/fmt/txt";

const char _serverStr[]    = "xgr30a.messaging.internetofthings.ibmcloud.com";
const char _clientStr[]    = "d:xgr30a:HouseDeviceType:tjhouse";
const char _tokenStr[]     = "tjhouse-token";
const char _evtTopicStr[]  = "iot-2/evt/house-data/fmt/json";
const char _cmdTopicStr[]  = "iot-2/cmd/house-cmd/fmt/txt";

int port = 1883;
//==========================================================================
//==========================================================================
//==========================================================================


//******** DATA WHICH IS SENT TO THE CLOUD ***********************
//String _arduinoName = "arduino01"; //can be read from the MQTT message on the server
float _humidity    = 0;
float _temperature = 0;
float _heatIndex   = 0;
int   _diode[]     = {0, 0, 0}; //R, G, B colors are turned off 
int   _door        = 0; //0-closed, 1-opened
//****************************************************************


//MQTT client - start
EthernetClient ethClient;

void cmdCallback(char* topic, byte* payload, unsigned int len) {
  Serial.print("Command received [");
  Serial.print(topic);
  Serial.print("] ");
  
//  char payloadStr[len+1];
//  memcpy(payloadStr, payload, len);
//  payloadStr[len] = '\0';
//  Serial.println(payloadStr);
  
  if (len < 2) { //bad message
//    free(payloadStr);
    return;
    } 
    
  char cmd = (char)payload[0];
  char cmd_value = (char)payload[1];
//  free(payloadStr);
  
  if (cmd == 'l' || cmd == 'l') { //LED COLOR
    Serial.print("changing color to ");
    Serial.println(cmd_value);
    if (cmd_value == 'r') { //RED
      change_led_color(1,0,0);
      return;
    }
    if (cmd_value == 'g') { //GREEN
      change_led_color(0,1,0);
      return;
    }
    if (cmd_value == 'b') { //BLUE
      change_led_color(0,0,1);
      return;
    }
    if (cmd_value == 'y') { //YELLOW
      change_led_color(1,1,0);
      return;
    }
    if (cmd_value == 'm') { //MAGENTA
      change_led_color(1,0,1);
      return;
    }
    if (cmd_value == 'c') { //CYAN
      change_led_color(0,1,1);
      return;
    }
    if (cmd_value == 'w') { //WHITE
      change_led_color(1,1,1);
      return;
    }
    if (cmd_value == 'x') { //RANDOM
      int r = random(0,2);
      int g = random(0,2);
      int b = random(0,2);
      if (r == 0 && g == 0 && b == 0){
        r = 1;
      }
      change_led_color(r,g,b);
      return;
    } 
  }

  if (cmd == 'x' || cmd == 'X') { //LED OFF
    Serial.println("Turning led off");
    change_led_color(0,0,0);
  }
  

  if (cmd == 'd' || cmd == 'd') { //DOOR
    if (cmd_value == 'o' || cmd_value == 'O'){
      door_open();
      Serial.println("Door opened.");
    }
    if (cmd_value == 'c' || cmd_value == 'C'){
      door_close();
      Serial.println("Door closed.");
    }
    return;
  }

  if (cmd == 'r' || cmd == 'R'){
    reset(); 
    return;
  }
}

void door_open(){
  door.write(85);
  _door = 1; //open
}

void door_close(){
  door.write(5);
  _door = 0; //close
}


void reset(){
  change_led_color(0,0,0);
  door_close();
}

void change_led_color(int r, int g, int b){

  if (r == 0) {
    digitalWrite(PIN_R, LOW);
    _diode[0] = 0;
  } else {
    digitalWrite(PIN_R, HIGH);
    _diode[0] = 1;
  }

  if (g == 0) {
    digitalWrite(PIN_G, LOW);
    _diode[1] = 0;
  } else {
    digitalWrite(PIN_G, HIGH);
    _diode[1] = 1;
  }

  if (b == 0) {
    digitalWrite(PIN_B, LOW);
    _diode[2] = 0;
  } else {
    digitalWrite(PIN_B, HIGH);
    _diode[2] = 1;
  }

}

PubSubClient pubSubClient(_serverStr, port, cmdCallback, ethClient);
//MQTT client - end

//======================= SETUP ==============================
void setup()
{
  Serial.begin(9600);
  
  //RGB diode
  initRGBDiode();

  //Ethernet connection
  initEthernet();
  
  //init DHT22
  dht.begin(); 
  
  //connect to Watson IoT once and then only if connection is lost
  connectToWatsonIoT();

  door.attach(5);

  reset(); //resets to defaut state (door is closed, LED is off)

  randomSeed(analogRead(0));

  lcd.begin(16, 2);
  lcd.print("T J B o t");
   lcd.setCursor(0, 1);
  lcd.print("       H o u s e");
}

//======================= LOOP ==============================
void loop() {  
  if (millis() - lastPublishMillis > publishInterval) {
      readDHT22();
      sendDataToWatsonIoT();
      showOnLCD();
      lastPublishMillis = millis();
   }

   if (!pubSubClient.loop()) {
      connectToWatsonIoT();
   }
}

void showOnLCD(){
  
  lcd.setCursor(0, 0);
  String tmp = "Temper: ";
  tmp += (float)_temperature;
  lcd.print(tmp);
  lcd.setCursor(14,0);
  lcd.print((char)223);
  lcd.print('C');

  lcd.setCursor(0, 1);
  tmp = "Humidi: ";
  tmp += (float)_humidity;
  tmp += " % ";
  lcd.print(tmp);
}

void initRGBDiode(){
  Serial.println("Init RGB diodes...");
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  change_led_color(0,0,0);
}

void initEthernet(){
  Serial.println("Init Ethernet...");
  pinMode(ETH_CS,OUTPUT);
  pinMode(SD_CS,OUTPUT);
  digitalWrite(ETH_CS,LOW); //select the Ethernet Module
  digitalWrite(SD_CS,HIGH); //de-Select the internal SD Card
  Ethernet.begin(_mac);
  Serial.print("IP address: ");
  Serial.println(Ethernet.localIP());
}

void connectToWatsonIoT(){
  if (pubSubClient.connect(_clientStr, "use-token-auth", _tokenStr)) {
    Serial.println("Connection to MQTT Broker Successfull");
    if (pubSubClient.subscribe(_cmdTopicStr)){
      Serial.println("Subcription OK");
    } else {
      Serial.println("Subcription FAILED");
    }
  } else {
    Serial.println("Connection to MQTT Broker Failed");
  }
}

void sendDataToWatsonIoT(){
  String json = createJSONMessage();
    char jsonStr[200];
    json.toCharArray(jsonStr,200);

    boolean pubresult = pubSubClient.publish(_evtTopicStr, jsonStr);
    Serial.print("Sending ");
    Serial.print(jsonStr);
    Serial.print(" to ");
    Serial.print(_evtTopicStr);
    if (pubresult)
      Serial.println(" SUCCESS");
    else
      Serial.println(" FAILED");
}

//Reads data from DHT22 sensor and save them among global variables
void readDHT22(){
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }
  
  //if read is correct, update values which are sent to the cloud 
  _humidity = h;
  _temperature = t;
  _heatIndex = dht.computeHeatIndex(t, h, false);
}


//Create a JSON message 
//example: { "t": 21.5, "h": 54.5, "hi": 21.13, "d": 1, "di": { "r": 0, "g": 0, "b": 0 }}
String createJSONMessage() {
  String data = "{";
  data += "\"t\":";
  data += (float)_temperature;
  data += ",\"h\":";
  data += (float)_humidity;
  data += ",\"hi\":";
  data += (float)_heatIndex;
  data += ",\"d\":";
  data += (int)_door;
  data += ",\"di\":{";
  data += "\"r\":";
  data += (int)_diode[0];
  data += ",\"g\":";
  data += (int)_diode[1];  
  data += ",\"b\":";
  data += (int)_diode[2];  
  data += "}}";
  return data;
}

