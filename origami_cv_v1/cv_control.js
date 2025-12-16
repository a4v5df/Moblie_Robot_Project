// ==========================================
// [cv_control.js] - 8-Finger Control (Dual Hands)
// ==========================================

// [전역 변수] 8개 모터 장력 배열 (0.0 ~ 1.0)
// 0~3: 왼손 (검지, 중지, 약지, 소지)
// 4~7: 오른손 (검지, 중지, 약지, 소지)
window.handTensions = [0, 0, 0, 0, 0, 0, 0, 0];

class HandController {
  constructor() {
    this.video = null;
    this.handPose = null;
    this.hands = [];
    this.isReady = false;

    this.container = document.getElementById('cam-container');
    this.canvas = document.getElementById('overlay-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
  }

  init() {
    // 1. 웹캠 캡처
    this.video = createCapture(VIDEO);
    this.video.size(320, 240);
    
    if (this.container) {
      this.video.parent('cam-container');
    }

    // 2. HandPose 설정
    let options = {
      flipped: true, // 거울 모드
      maxHands: 2    // 양손 인식
    };

    this.handPose = ml5.handPose(options, () => {
      console.log('👉 HandPose Loaded! (Max Hands: 2, 8-Finger Control)');
      this.isReady = true;
      this.handPose.detectStart(this.video, (results) => {
        this.hands = results;
      });
    });
  }

  update() {
    // 손이 없으면 값 초기화 (안전장치)
    if (!this.isReady || this.hands.length === 0) {
        window.handTensions.fill(0);
        return;
    }

    // 이번 프레임의 장력 값을 담을 임시 배열
    let currentTensions = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let hand of this.hands) {
      if (!hand.keypoints) continue;

      let wrist = hand.keypoints[0];
      let middleMCP = hand.keypoints[9];
      let palmSize = dist(wrist.x, wrist.y, middleMCP.x, middleMCP.y);

      if (palmSize < 10) continue; 

      // 장력 계산 헬퍼 함수
      const calculateTension = (tipIdx) => {
        let tip = hand.keypoints[tipIdx];
        let d = dist(wrist.x, wrist.y, tip.x, tip.y);
        let ratio = d / palmSize; 
        // 1.8(펼침) ~ 0.7(주먹) -> 0.0 ~ 1.0 매핑
        return map(ratio, 1.8, 0.7, 0.0, 1.0, true);
      };

      // 손가락 끝 랜드마크 인덱스: 검지(8), 중지(12), 약지(16), 소지(20)
      
      if (hand.handedness === 'Left') {
        // [왼손] -> 배열 인덱스 0, 1, 2, 3
        currentTensions[0] = calculateTension(8);  // 검지
        currentTensions[1] = calculateTension(12); // 중지
        currentTensions[2] = calculateTension(16); // 약지
        currentTensions[3] = calculateTension(20); // 소지
      } else {
        // [오른손] -> 배열 인덱스 4, 5, 6, 7
        currentTensions[4] = calculateTension(8);  // 검지
        currentTensions[5] = calculateTension(12); // 중지
        currentTensions[6] = calculateTension(16); // 약지
        currentTensions[7] = calculateTension(20); // 소지
      }
    }

    // 전역 변수 업데이트 (부드러운 움직임을 위해 보간을 추가할 수도 있음)
    window.handTensions = currentTensions;
  }

  drawDebug() {
    // 캔버스 UI 위치 조정
    let sliderSize = document.getElementById('camSize');
    let sliderX    = document.getElementById('camPosX');
    let sliderY    = document.getElementById('camPosY');

    if (this.container && sliderSize) {
      let w = parseInt(sliderSize.value);
      let h = w * 0.75; 
      let valX = sliderX ? parseInt(sliderX.value) : 95;
      let valY = sliderY ? parseInt(sliderY.value) : 5;
      
      let maxLeft = window.innerWidth - w;
      let maxTop = window.innerHeight - h;
      
      let left = map(valX, 0, 100, 0, maxLeft);
      let top  = map(valY, 0, 100, 0, maxTop);

      this.container.style.width = w + 'px';
      this.container.style.height = h + 'px';
      this.container.style.left = left + 'px';
      this.container.style.top = top + 'px';
    }

    // 2D 뼈대 그리기
    if (this.ctx && this.isReady) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      for (let hand of this.hands) {
        this.ctx.lineWidth = 2;
        // 왼손(초록), 오른손(파랑) 구분
        this.ctx.strokeStyle = hand.handedness === 'Left' ? '#00FF00' : '#00FFFF'; 

        // 5개 손가락 뼈대
        this.drawFinger2D(hand, [0, 1, 2, 3, 4]);       
        this.drawFinger2D(hand, [0, 5, 6, 7, 8]);       
        this.drawFinger2D(hand, [0, 9, 10, 11, 12]);    
        this.drawFinger2D(hand, [0, 13, 14, 15, 16]);   
        this.drawFinger2D(hand, [0, 17, 18, 19, 20]);   

        // 관절
        this.ctx.fillStyle = 'red';
        for(let p of hand.keypoints) {
           this.ctx.beginPath();
           this.ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
           this.ctx.fill();
        }
        
        // 제어점(4개 손가락 끝) 강조
        let tips = [8, 12, 16, 20];
        this.ctx.fillStyle = '#FFFF00'; 
        for (let idx of tips) {
            let p = hand.keypoints[idx];
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
            this.ctx.fill();
        }
      }
    }
  }

  drawFinger2D(hand, indices) {
    this.ctx.beginPath();
    let start = hand.keypoints[indices[0]];
    this.ctx.moveTo(start.x, start.y);
    for (let i = 1; i < indices.length; i++) {
      let p = hand.keypoints[indices[i]];
      this.ctx.lineTo(p.x, p.y);
    }
    this.ctx.stroke();
  }
}