/*
 * 🧪 ESP32 8-Channel Servo Calibration & Test Tool
 * =================================================
 * 시리얼 모니터에 명령어를 입력하여 모터를 제어합니다.
 * * [명령어 사용법]
 * 1. 개별 제어: "모터번호 값" (예: "0 93" -> 0번 모터를 93으로 설정)
 * 2. 전체 제어: "a 값"       (예: "a 100" -> 모든 모터를 100으로 설정)
 * 3. 전체 정지: "s"          (모든 모터를 93 근처 정지값으로 리셋 시도, 안전장치)
 * 4. 현재 상태: "p"          (모든 모터의 현재 PWM 값 출력)
 * * [값 범위]
 * 0 ~ 180 (보통 90~95 사이가 정지, 숫자가 작거나 크면 회전)
 */

#include <ESP32Servo.h>

// ==========================================
// [하드웨어 설정]
// ==========================================
const int NUM_SERVOS = 8;
// 핀 맵핑: 왼손(0~3), 오른손(4~7)
const int servoPins[NUM_SERVOS] = {27, 14, 12, 13, 25, 26, 32, 33};

Servo servos[NUM_SERVOS];
int currentValues[NUM_SERVOS]; // 현재 PWM 값 저장용

// [기본 정지값] - 테스트 시작 시 안전을 위해 사용하는 값
const int DEFAULT_STOP = 93; 

void setup() {
  Serial.begin(115200);
  while(!Serial); // 시리얼 연결 대기

  Serial.println("\n\n==============================================");
  Serial.println("       🎹 ESP32 Motor Calibration Tool       ");
  Serial.println("==============================================");
  Serial.println("명령어 예시:");
  Serial.println(" - 개별 모터: [인덱스] [값] (예: 0 94)");
  Serial.println(" - 전체 모터: a [값]       (예: a 110)");
  Serial.println(" - 긴급 정지: s");
  Serial.println(" - 상태 확인: p");
  Serial.println("==============================================");

  // 모터 초기화
  for (int i = 0; i < NUM_SERVOS; i++) {
    servos[i].attach(servoPins[i]);
    servos[i].write(DEFAULT_STOP);
    currentValues[i] = DEFAULT_STOP;
  }
  Serial.println("✅ 모든 모터 초기화 완료 (값: 93)");
}

void loop() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim(); // 공백 제거

    if (input.length() == 0) return;

    // 1. 긴급 정지 (s)
    if (input.equalsIgnoreCase("s")) {
      stopAll();
      return;
    }

    // 2. 상태 출력 (p)
    if (input.equalsIgnoreCase("p")) {
      printStatus();
      return;
    }

    // 3. 명령어 파싱 (공백 기준 분리)
    int spaceIndex = input.indexOf(' ');
    if (spaceIndex == -1) {
      Serial.println("❌ 잘못된 명령어 형식입니다. (예: 0 95)");
      return;
    }

    String cmdPart = input.substring(0, spaceIndex);
    String valPart = input.substring(spaceIndex + 1);
    
    int val = valPart.toInt();
    
    // 값 범위 안전 장치
    if (val < 0) val = 0;
    if (val > 180) val = 180;

    // 4-1. 전체 제어 (a)
    if (cmdPart.equalsIgnoreCase("a")) {
      Serial.print("⏩ 모든 모터를 ");
      Serial.print(val);
      Serial.println("(으)로 설정합니다.");
      for (int i = 0; i < NUM_SERVOS; i++) {
        servos[i].write(val);
        currentValues[i] = val;
      }
    }
    // 4-2. 개별 제어 (숫자)
    else {
      int motorIdx = cmdPart.toInt();
      // 인덱스 유효성 검사
      if (motorIdx >= 0 && motorIdx < NUM_SERVOS) {
        Serial.print("👉 모터 [");
        Serial.print(motorIdx);
        Serial.print("] (Pin ");
        Serial.print(servoPins[motorIdx]);
        Serial.print(") -> ");
        Serial.println(val);
        
        servos[motorIdx].write(val);
        currentValues[motorIdx] = val;
      } else {
        Serial.println("❌ 잘못된 모터 번호입니다. (0 ~ 7 가능)");
      }
    }
  }
}

void stopAll() {
  Serial.println("\n🛑 긴급 정지 실행!");
  for (int i = 0; i < NUM_SERVOS; i++) {
    servos[i].write(DEFAULT_STOP);
    currentValues[i] = DEFAULT_STOP;
  }
}

void printStatus() {
  Serial.println("\n--- 현재 모터 상태 ---");
  for (int i = 0; i < NUM_SERVOS; i++) {
    Serial.print("Motor ");
    Serial.print(i);
    Serial.print(": ");
    Serial.print(currentValues[i]);
    if (currentValues[i] == DEFAULT_STOP) Serial.print(" (Stop?)");
    Serial.print("\t");
    if ((i + 1) % 4 == 0) Serial.println(); // 4개씩 줄바꿈
  }
  Serial.println("--------------------");
}