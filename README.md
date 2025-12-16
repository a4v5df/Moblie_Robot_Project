# 🤖 Origami Tendon-Driven Soft Robot Project

**종이접기(Origami) 구조 기반의 텐던 구동 소프트 로봇 통합 제어 시스템**입니다.
본 리포지토리는 로봇 제어 방식의 발전 과정과 목적에 따라 **3가지 핵심 프로젝트**로 구성되어 있습니다.

---

## 📂 프로젝트 구성 (Project Structure)

| 폴더명 | 제어 방식 | 주요 특징 |
| :--- | :--- | :--- |
| **1. origami_cv_v1** | **기초 제어 & 캘리브레이션** | 서보모터 초기 설정 및 비례 제어(Proportional) 테스트 버전 |
| **2. origami_cv_hand_onoff** | **CV ON/OFF 제어** | 하드웨어 신뢰성을 위한 임계값(Threshold) 기반 제어 (데모용) |
| **3. Origami_AI_Project** | **AI 역기구학** | 신경망(Neural Network)을 이용한 위치 좌표(X,Y,Z) 기반 자동 제어 |

---

## 1️⃣ Origami CV V1 (Calibration & Basic Control)
> **초기 개발 및 모터 테스트 단계**

프로젝트의 초기 버전으로, ESP32와 서보모터의 연결 상태를 확인하고 모터를 캘리브레이션하는 도구가 포함되어 있습니다. 손가락의 굽힘 정도를 아날로그 값(0~180)으로 매핑하는 비례 제어 로직의 기초가 됩니다.

* **주요 파일**: `servo_test.ino`
* **기능**:
    * 시리얼 모니터를 통한 개별/전체 모터 제어 명령 (`a 90`, `s` 등)
    * 각 모터의 중립(Stop) 위치 미세 조정
    * Web Serial 통신의 기초 테스트

## 2️⃣ Origami CV Hand On/Off (Hardware Optimized)
> **하드웨어 시연 및 데모를 위한 최적화 버전**

센서 피드백이 없는 실제 하드웨어 환경에서, 모터의 오동작을 방지하고 확실한 움직임을 보여주기 위해 **ON/OFF 방식**을 채택한 버전입니다.

* **제어 로직 (Trigger & Direction)**:
    * **엄지 (Mode)**: 접으면 **풀기(Unwind)** 모드 / 펴면 **감기(Wind)** 모드 (상태 LED: 파랑/빨강)
    * **나머지 손가락 (Trigger)**: 60% 이상 접을 시 해당 와이어 모터 **ON** (속도 고정)
* **특징**:
    * 비례 제어 대비 움직임은 끊기지만, 와이어 꼬임 방지와 조작 직관성이 뛰어납니다.
    * `cv_control.js`를 통해 손의 랜드마크를 시각적으로 디버깅할 수 있습니다.

## 3️⃣ Origami AI Project (Inverse Kinematics)
> **AI 기반의 최종 제어 시스템 (Inverse Kinematics)**

목표 좌표(X, Y, Z)를 입력하면, 학습된 AI 모델이 로봇을 해당 위치로 이동시키기 위한 8개 모터의 값을 자동으로 계산합니다.

* **Core Logic (`ai_manager.js`)**:
    1.  **데이터 수집 (Data Collection)**: 시뮬레이션 상에서 로봇을 무작위 및 동기화 패턴으로 움직여 학습 데이터셋 구축
    2.  **모델 학습 (Training)**: TensorFlow.js 기반의 신경망 학습 (Epochs: 50~200)
    3.  **예측 제어 (Prediction)**: 학습된 모델을 통해 원하는 좌표로 로봇 제어
* **주요 기능**:
    * **Auto-Scanning**: 로봇의 가동 범위(Workspace) 자동 스캔 및 슬라이더 범위 설정
    * **Validation**: 돔(Dome) 형태의 궤적을 따라 움직이며 실제 움직임과 AI 예측 간의 오차(Error) 시각화
    * **Control**: 슬라이더 UI 및 키보드(WASD)를 통한 3축 제어

---

## 🛠️ 기술 스택 (Tech Stack)

* **Frontend**: HTML5, CSS3, JavaScript (ES6+)
* **Simulation & 3D**: [p5.js](https://p5js.org/) (WebGL)
* **AI & Computer Vision**: [ml5.js](https://ml5js.org/) (HandPose, NeuralNetwork)
* **Hardware Communication**: Web Serial API (No Backend Server Required)
* **Firmware**: Arduino (ESP32)

## 🔌 하드웨어 핀맵 (ESP32 Pinout)

**2-Stage Kresling Pattern Robot (8 Motors)**

| Stage | Position | Finger Mapping | GPIO Pin |
| :---: | :---: | :---: | :---: |
| **Top** | Front-Right | 왼손 검지 | **27** |
| **Top** | Back-Right | 왼손 중지 | **32** |
| **Top** | Back-Left | 왼손 약지 | **33** |
| **Top** | Front-Left | 왼손 소지 | **12** |
| **Bottom** | Front-Right | 오른손 검지 | **14** |
| **Bottom** | Back-Right | 오른손 중지 | **25** |
| **Bottom** | Back-Left | 오른손 약지 | **26** |
| **Bottom** | Front-Left | 오른손 소지 | **13** |

*(Note: `origami_robot_esp32.ino` 파일 내 `servoPins` 배열을 참조하여 실제 배선에 맞게 수정이 필요합니다.)*

