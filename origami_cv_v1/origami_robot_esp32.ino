#include <ESP32Servo.h>

// ==========================================
// [설정] 서보 모터 8개 핀 번호 및 설정
// ==========================================
const int NUM_SERVOS = 8;
// 순서대로 v1 ~ v8에 대응됩니다.
const int servoPins[NUM_SERVOS] = {27, 14, 12, 13, 25, 26, 32, 33};

Servo servos[NUM_SERVOS];

// 통신 버퍼
String inputString = "";
boolean stringComplete = false;

// [중요] 모터 정지값 (사용하는 모터에 맞춰 미세 조정 필요: 보통 90~94)
const int SERVO_STOP_VAL = 93; 

void setup() {
  Serial.begin(115200);

  // 8개 서보 초기화
  for (int i = 0; i < NUM_SERVOS; i++) {
    servos[i].attach(servoPins[i]);
    servos[i].write(SERVO_STOP_VAL); // 초기 상태: 정지
  }
  
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

// 데이터 포맷 예시: "133,53,93,93,100,90,93,93"
void parseAndDrive(String data) {
  int startIdx = 0;
  int commaIdx = -1;

  for (int i = 0; i < NUM_SERVOS; i++) {
    // 다음 쉼표 위치 찾기
    commaIdx = data.indexOf(',', startIdx);
    
    String valStr;
    if (commaIdx != -1) {
      // 쉼표가 있으면 그 사이의 값 추출
      valStr = data.substring(startIdx, commaIdx);
      startIdx = commaIdx + 1;
    } else {
      // 마지막 값이면 문자열 끝까지 추출
      valStr = data.substring(startIdx);
    }

    // 정수로 변환
    int speedVal = valStr.toInt();
    
    // 안전 장치 (0~180 범위 제한)
    if(speedVal < 0) speedVal = 0;
    if(speedVal > 180) speedVal = 180;

    // 모터 구동
    servos[i].write(speedVal);
  }
}