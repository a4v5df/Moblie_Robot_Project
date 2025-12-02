#include <ESP32Servo.h>

const int PIN_UP    = 13;
const int PIN_DOWN  = 12;
const int PIN_LEFT  = 14;
const int PIN_RIGHT = 27;

Servo servoUp;
Servo servoDown;
Servo servoLeft;
Servo servoRight;

// [중요] 통신 버퍼
String inputString = "";
boolean stringComplete = false;

void setup() {
  Serial.begin(115200);

  servoUp.attach(PIN_UP);
  servoDown.attach(PIN_DOWN);
  servoLeft.attach(PIN_LEFT);
  servoRight.attach(PIN_RIGHT);

  // 초기 상태: 정지 (아까 찾으신 93을 쓰거나, 테스트 필요)
  // 일단 93으로 시작합니다.
  int stopVal = 93; 
  servoUp.write(stopVal);
  servoDown.write(stopVal);
  servoLeft.write(stopVal);
  servoRight.write(stopVal);
  
  inputString.reserve(200);
}

void loop() {
  checkSerial();
  if (stringComplete) {
    parseAndDrive(inputString);
    inputString = "";
    stringComplete = false;
  }
}

void checkSerial() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == '\n') {
      stringComplete = true; 
    } else {
      inputString += inChar;
    }
  }
}

void parseAndDrive(String data) {
  // JS에서 이미 "속도값(93, 110, 76 등)"을 계산해서 보내줍니다.
  // 아두이노는 받은 그대로 모터에 쏘기만 하면 됩니다.
  
  int first = data.indexOf(',');
  int second = data.indexOf(',', first + 1);
  int third = data.indexOf(',', second + 1);

  if (first > 0) {
    int v1 = data.substring(0, first).toInt();
    int v2 = data.substring(first + 1, second).toInt();
    int v3 = data.substring(second + 1, third).toInt();
    int v4 = data.substring(third + 1).toInt();

    servoUp.write(v1);
    servoDown.write(v2);
    servoLeft.write(v3);
    servoRight.write(v4);
  }
}