// ==========================================
// [cv_control.js] - Thumb Mode + Trigger Control
// ==========================================

// [전역 변수]
// 1. 손가락 4개(검지~소지)의 접힘 정도 (0.0 ~ 1.0)
//    0~3: 왼손 / 4~7: 오른손
window.handTensions = [0, 0, 0, 0, 0, 0, 0, 0];

// 2. 엄지손가락 상태 (true: 접힘/풀기모드, false: 펴짐/감기모드)
//    [0]: 왼손 엄지, [1]: 오른손 엄지
window.handThumbState = [false, false];

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
    this.video = createCapture(VIDEO);
    this.video.size(320, 240);
    
    if (this.container) {
      this.video.parent('cam-container');
    }

    let options = {
      flipped: true,
      maxHands: 2
    };

    this.handPose = ml5.handPose(options, () => {
      console.log('👉 HandPose Ready: Thumb=Mode, Fingers=Trigger');
      this.isReady = true;
      this.handPose.detectStart(this.video, (results) => {
        this.hands = results;
      });
    });
  }

  update() {
    if (!this.isReady || this.hands.length === 0) return;

    let currentTensions = [0, 0, 0, 0, 0, 0, 0, 0];
    let currentThumbs = [false, false];

    for (let hand of this.hands) {
      if (!hand.keypoints) continue;

      let wrist = hand.keypoints[0];
      let middleMCP = hand.keypoints[9];
      let palmSize = dist(wrist.x, wrist.y, middleMCP.x, middleMCP.y);

      if (palmSize < 10) continue; 

      // 접힘 정도 계산 (0.0: 펴짐 ~ 1.0: 주먹)
      const calculateFold = (tipIdx) => {
        let tip = hand.keypoints[tipIdx];
        let d = dist(wrist.x, wrist.y, tip.x, tip.y);
        let ratio = d / palmSize; 
        return map(ratio, 1.8, 0.8, 0.0, 1.0, true);
      };

      // 1. 엄지 상태 판별 (끝점: 4)
      // 엄지는 구조상 ratio가 다르므로 0.5 기준으로 판별
      let thumbVal = calculateFold(4);
      let isThumbFolded = (thumbVal > 0.5); 

      // 2. 나머지 손가락 (검지:8, 중지:12, 약지:16, 소지:20)
      let fingers = [
        calculateFold(8), calculateFold(12), calculateFold(16), calculateFold(20)
      ];

      if (hand.handedness === 'Left') {
        currentThumbs[0] = isThumbFolded;
        for(let i=0; i<4; i++) currentTensions[i] = fingers[i];
      } else {
        currentThumbs[1] = isThumbFolded;
        for(let i=0; i<4; i++) currentTensions[4+i] = fingers[i];
      }
    }

    window.handTensions = currentTensions;
    window.handThumbState = currentThumbs;
  }

  drawDebug() {
    // UI 위치 조정 (기존 유지)
    let sliderSize = document.getElementById('camSize');
    let sliderX = document.getElementById('camPosX');
    let sliderY = document.getElementById('camPosY');

    if (this.container && sliderSize) {
      let w = parseInt(sliderSize.value);
      let h = w * 0.75; 
      let valX = sliderX ? parseInt(sliderX.value) : 95;
      let valY = sliderY ? parseInt(sliderY.value) : 5;
      
      this.container.style.width = w + 'px';
      this.container.style.height = h + 'px';
      this.container.style.left = map(valX, 0, 100, 0, window.innerWidth - w) + 'px';
      this.container.style.top = map(valY, 0, 100, 0, window.innerHeight - h) + 'px';
    }

    // 뼈대 및 상태 그리기
    if (this.ctx && this.isReady) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      for (let hand of this.hands) {
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = hand.handedness === 'Left' ? '#00FF00' : '#00FFFF'; 

        // 손가락 뼈대
        let fingersIdx = [[0,1,2,3,4], [0,5,6,7,8], [0,9,10,11,12], [0,13,14,15,16], [0,17,18,19,20]];
        for(let indices of fingersIdx) this.drawFinger2D(hand, indices);

        // 엄지 상태 시각화
        let isLeft = hand.handedness === 'Left';
        let isThumbFolded = isLeft ? window.handThumbState[0] : window.handThumbState[1];
        
        // 엄지 끝점 (펴짐=빨강/감기모드, 접힘=파랑/풀기모드)
        let thumbTip = hand.keypoints[4];
        this.ctx.fillStyle = isThumbFolded ? '#010101ff' : '#FF0000'; 
        this.ctx.beginPath(); this.ctx.arc(thumbTip.x, thumbTip.y, 8, 0, 2*Math.PI); this.ctx.fill();

        // 나머지 손가락 끝점 (트리거 활성 시 노랑)
        let tipIndices = [8, 12, 16, 20];
        let tensions = isLeft ? window.handTensions.slice(0,4) : window.handTensions.slice(4,8);
        
        for(let i=0; i<4; i++) {
            let p = hand.keypoints[tipIndices[i]];
            this.ctx.fillStyle = tensions[i] > 0.6 ? '#040004ff' : '#f315ceff';
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, 5, 0, 2*Math.PI); this.ctx.fill();
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