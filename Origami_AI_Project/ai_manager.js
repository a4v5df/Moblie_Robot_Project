// ==========================================================================
// [ai_manager.js] - Ultimate Final Version (Keyboard Control Added)
// (Sync Mode Data Collection + Real-time Error Display + Y-Up Support)
// ==========================================================================

class AIManager {
  constructor() {
    this.model = null;
    this.state = "IDLE"; 
    this.dataCount = 0;
    this.DATA_LIMIT = 3000; 
    
    this.isBusy = false;
    this.isPredicting = false;
    
    this.validationStep = 0;
    this.validationLogs = [];

    // [중요] 로봇 가동 범위 (Auto-Calibration)
    // Y가 높이(Height), X/Z가 반경
    this.bounds = {
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        minZ: Infinity, maxZ: -Infinity,
        maxR: 0 
    };

    this.createMotorMonitorUI();
    this.initModel();
  }

  // 모터 모니터링 바 생성
  createMotorMonitorUI() {
    const container = document.getElementById('motor-bars');
    if (!container) return;
    container.innerHTML = '';
    
    for(let i=0; i<8; i++) {
        let row = document.createElement('div');
        row.className = 'motor-row';
        
        let label = document.createElement('span');
        label.className = 'motor-label';
        label.innerText = `M${i+1}`;
        
        let bg = document.createElement('div');
        bg.className = 'motor-bar-bg';
        
        let fill = document.createElement('div');
        fill.className = 'motor-bar-fill';
        fill.id = `mbar-${i}`;
        
        let val = document.createElement('span');
        val.className = 'motor-val';
        val.id = `mval-${i}`;
        val.innerText = "0.0";

        bg.appendChild(fill);
        row.appendChild(label);
        row.appendChild(bg);
        row.appendChild(val);
        container.appendChild(row);
    }
  }

  initModel() {
    if (ml5.tf) { try { ml5.tf.setBackend("webgl"); } catch (e) {} }

    const options = {
      inputs: 3, outputs: 8, task: 'regression', debug: true,
      layers: [
        { type: 'dense', units: 64, activation: 'relu' },
        // { type: 'dense', units: 8, activation: 'relu' },
        
        // { type: 'dense', units: 64, activation: 'relu' },
        // { type: 'dense', units: 32, activation: 'relu' },
        { type: 'dense', units: 8, activation: 'sigmoid' }
      ]
    };
    this.model = ml5.neuralNetwork(options);
    this.log("✅ AI 모델 초기화 완료");
  }

  update() {
    if (this.state === "COLLECTING") this.processDataCollection();
    if (this.state === "VALIDATING") this.processValidation();
    if (this.state === "PREDICTING") this.processPrediction();
    
    // UI 업데이트 (슬라이더 값 표시)
    if (this.state === "PREDICTING") {
        const elX = document.getElementById('valX');
        const elY = document.getElementById('valY');
        const elZ = document.getElementById('valZ');
        if(elX) elX.innerText = document.getElementById('inX').value;
        if(elY) elY.innerText = document.getElementById('inY').value;
        if(elZ) elZ.innerText = document.getElementById('inZ').value;
    }
  }

  // ----------------------------------------------------------------
  // [Step 1] 데이터 수집 (Random + Sync 모드 혼합)
  // ----------------------------------------------------------------
  startDataCollection() {
    this.state = "COLLECTING";
    this.dataCount = 0;
    this.isBusy = false;
    this.bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, maxR: 0 };
    this.log("🚀 데이터 수집 시작...");
  }

  processDataCollection() {
    if (!window.robot) return;

    if (this.dataCount >= this.DATA_LIMIT) {
      this.finishDataCollection();
      return;
    }

    let motors = [];
    
    // [핵심 수정 로직]
    // 30% 확률로 '동기화 모드' (모두 비슷하게 움직임 -> 수직 운동/압축 데이터 확보)
    // 70% 확률로 '완전 랜덤' (다양한 꺾임 데이터 확보)
    if (Math.random() < 0.3) {
        // [동기화 모드] 중심축(0,0) 근처 데이터 확보용
        let baseVal = Math.random(); 
        for(let i=0; i<8; i++) {
            let val = baseVal + (Math.random() * 0.1 - 0.05); // ±0.05 오차
            motors.push(Math.max(0.0, Math.min(1.0, val)));   
        }
    } else {
        // [완전 랜덤 모드] 0.0~1.0 전체 범위 사용
        for(let i=0; i<8; i++) {
            motors.push(Math.random()); 
        }
    }

    this.applyToSimulation(motors);
    window.robot.update(); 

    let head = window.robot.joints[window.robot.totalSegs];
    
    if (head && !isNaN(head.x) && !isNaN(head.y) && !isNaN(head.z)) {
      this.model.addData([head.x, head.y, head.z], motors);
      
      // 범위 갱신 (Y가 높이)
      this.bounds.minX = Math.min(this.bounds.minX, head.x);
      this.bounds.maxX = Math.max(this.bounds.maxX, head.x);
      this.bounds.minY = Math.min(this.bounds.minY, head.y); // Height
      this.bounds.maxY = Math.max(this.bounds.maxY, head.y);
      this.bounds.minZ = Math.min(this.bounds.minZ, head.z); // Depth
      this.bounds.maxZ = Math.max(this.bounds.maxZ, head.z);
      
      let r = Math.sqrt(head.x*head.x + head.z*head.z);
      this.bounds.maxR = Math.max(this.bounds.maxR, r);

      this.dataCount++;
    } 
    
    if (this.dataCount % 200 === 0) {
      this.setStatus(`수집 중: ${this.dataCount} / ${this.DATA_LIMIT}`);
    }
  }

  finishDataCollection() {
    this.state = "IDLE";
    this.applyToSimulation([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    
    console.log("📐 가동 범위 스캔 결과:", this.bounds);
    this.updateSliderLimits(); 

    this.setStatus("데이터 정리 중...");
    setTimeout(() => {
        this.model.normalizeData(); 
        this.log(`✅ 수집 완료 (${this.dataCount}개)`);
        this.setStatus(`준비 완료. [H범위: ${Math.round(this.bounds.minY)}~${Math.round(this.bounds.maxY)}]`);
        document.getElementById('btnTrain').disabled = false;
    }, 500);
  }

  updateSliderLimits() {
    const setLimit = (id, min, max, val) => {
        const el = document.getElementById(id);
        if(!el) return;
        el.min = Math.floor(min * 0.9);
        el.max = Math.ceil(max * 0.9);
        el.value = val || (min+max)/2;
    };
    // 슬라이더 매핑 (Y가 높이, Z가 깊이)
    setLimit('inX', this.bounds.minX, this.bounds.maxX, 0);
    setLimit('inY', this.bounds.minY, this.bounds.maxY, (this.bounds.minY + this.bounds.maxY)/2); 
    setLimit('inZ', this.bounds.minZ, this.bounds.maxZ, 0); 
  }

  // ----------------------------------------------------------------
  // [Step 2] 학습
  // ----------------------------------------------------------------
  startTraining() {
    this.state = "TRAINING";
    this.log("🔥 학습 시작 (200 Epoch)...");
    const trainingOptions = { epochs: 50, batchSize: 32 };
    this.model.train(trainingOptions, 
      (epoch, loss) => {
        if(epoch % 20 === 0) console.log(`Epoch: ${epoch}, Loss: ${loss.loss}`);
      }, 
      () => {
        this.state = "IDLE";
        this.log("🎉 학습 완료!");
        this.setStatus("학습 완료. 검증 및 제어 가능");
        document.getElementById('btnValid').disabled = false;
        document.getElementById('btnPredict').disabled = false;
      }
    );
  }

  // ----------------------------------------------------------------
  // [Step 3] 검증 (빨간 공 타겟 표시)
  // ----------------------------------------------------------------
  startValidation() {
    this.state = "VALIDATING";
    this.validationStep = 0;
    this.validationLogs = [];
    this.isBusy = false;
    this.log("📈 검증 시작...");
  }

// ----------------------------------------------------------------
  // [Step 3] 검증 (수정됨: 돔 형태 궤적 적용)
  // ----------------------------------------------------------------
  processValidation() {
    let stepsTotal = 200;
    if (this.validationStep > stepsTotal) {
      this.saveCSV();
      this.state = "IDLE";
      return;
    }
    if (this.isBusy) return;
    this.isBusy = true;

    // 1. 안전 높이 범위 설정
    let minY = this.bounds.minY + 5; 
    let maxY = this.bounds.maxY - 5;
    let safeR_Max = this.bounds.maxR * 0.9; // 최대 반경의 90%

    // 2. 높이(Y) 계산 (위아래로 왕복)
    let theta = this.validationStep / stepsTotal * Math.PI * 4; 
    let progress = (Math.sin(theta * 0.5) + 1) / 2; // 0.0 ~ 1.0
    let targetY = progress * (maxY - minY) + minY;

    // [핵심 수정] 높이에 따른 반경 보정 (Dome Effect)
    // 중간 높이에서는 반경이 크고, 위/아래 끝에서는 반경이 0이 되도록 함
    // Math.sin(0) = 0, Math.sin(PI/2) = 1, Math.sin(PI) = 0
    let domeScale = Math.sin(progress * Math.PI); 
    
    // 최소한의 움직임은 보장하기 위해 0.2 정도의 offset은 줄 수도 있지만, 
    // 오리가미 특성상 끝에서는 거의 0이 맞음.
    let currentR = safeR_Max * domeScale; 

    // 3. X, Z 좌표 계산
    let targetX = currentR * Math.cos(theta);
    let targetZ = currentR * Math.sin(theta);

    // 검증 목표 시각화
    window.targetPos = { x: targetX, y: targetY, z: targetZ };

    this.model.predict([targetX, targetY, targetZ], (results) => {
      setTimeout(() => { this.isBusy = false; }, 30); 

      if (!results) { this.validationStep++; return; }

      let motorVals = results.map(r => Math.max(0.1, Math.min(0.8, r.value)));
      this.applyToSimulation(motorVals);
      
      if(window.robot) window.robot.update();

      let actual = window.robot.joints[window.robot.totalSegs];
      let dx = targetX - actual.x;
      let dy = targetY - actual.y;
      let dz = targetZ - actual.z;
      let errorDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      this.validationLogs.push({
        step: this.validationStep, target_x: targetX, target_y: targetY, target_z: targetZ,
        actual_x: actual.x, actual_y: actual.y, actual_z: actual.z, error: errorDist
      });
      
      this.validationStep++;
    });
  }

  saveCSV() {
    window.targetPos = null;
    let csvContent = "data:text/csv;charset=utf-8,Step,TargetX,TargetY,TargetZ,ActualX,ActualY,ActualZ,Error\n";
    this.validationLogs.forEach(r => {
      csvContent += `${r.step},${r.target_x},${r.target_y},${r.target_z},${r.actual_x},${r.actual_y},${r.actual_z},${r.error}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "3d_validation_data.csv");
    document.body.appendChild(link);
    link.click();
  }

  // ----------------------------------------------------------------
  // [Step 4] 예측 제어 (실시간 오차 계산)
  // ----------------------------------------------------------------
  togglePrediction() {
    this.isPredicting = !this.isPredicting;
    this.state = this.isPredicting ? "PREDICTING" : "IDLE";
    
    const btn = document.getElementById('btnPredict');
    const controls = document.getElementById('slider-controls');
    
    if (this.isPredicting) {
        btn.innerText = "AI 슬라이더 제어 (ON)";
        btn.style.background = "#D32F2F";
        controls.style.opacity = "1.0";
        controls.style.pointerEvents = "auto";
        
        if(window.robot) {
            let h = window.robot.joints[window.robot.totalSegs];
            if(document.getElementById('inX')) document.getElementById('inX').value = h.x;
            if(document.getElementById('inY')) document.getElementById('inY').value = h.y;
            if(document.getElementById('inZ')) document.getElementById('inZ').value = h.z;
        }
    } else {
        btn.innerText = "AI 슬라이더 제어 (OFF)";
        btn.style.background = "#1976D2";
        controls.style.opacity = "0.4";
        controls.style.pointerEvents = "none";
        window.targetPos = null; // 타겟 시각화 끄기
    }
  }

  processPrediction() {
    if (this.isBusy) return;
    this.isBusy = true;

    let rawX = parseFloat(document.getElementById('inX').value);
    let rawY = parseFloat(document.getElementById('inY').value); 
    let rawZ = parseFloat(document.getElementById('inZ').value); 

    // 안전 범위 적용
    let safeY = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, rawY));
    
    let currentR = Math.sqrt(rawX*rawX + rawZ*rawZ);
    let maxAllowedR = this.bounds.maxR * 0.95; 

    let safeX = rawX, safeZ = rawZ;
    if (currentR > maxAllowedR && maxAllowedR > 0) {
        let ratio = maxAllowedR / currentR;
        safeX = rawX * ratio;
        safeZ = rawZ * ratio;
    }

    this.model.predict([safeX, safeY, safeZ], (results) => {
      this.isBusy = false;
      if (results) {
        let motorVals = results.map(r => Math.max(0.1, Math.min(0.8, r.value)));
        this.applyToSimulation(motorVals);
        this.updateMotorMonitor(motorVals);
        
        // 실시간 오차 계산
        if (window.robot) {
            window.robot.update(); 
            let actual = window.robot.joints[window.robot.totalSegs];

            let dx = safeX - actual.x;
            let dy = safeY - actual.y;
            let dz = safeZ - actual.z;
            let error = Math.sqrt(dx*dx + dy*dy + dz*dz);

            const errEl = document.getElementById('error-display');
            if (errEl) {
                errEl.innerText = error.toFixed(2);
                if(error < 10) errEl.style.color = "#00e676";
                else if(error < 30) errEl.style.color = "#ffeb3b";
                else errEl.style.color = "#ff5252";
            }
        }
      }
    });

    window.targetPos = { x: safeX, y: safeY, z: safeZ };
  }
  
  updateMotorMonitor(vals) {
    for(let i=0; i<8; i++) {
        let percent = vals[i] * 100;
        let bar = document.getElementById(`mbar-${i}`);
        let text = document.getElementById(`mval-${i}`);
        if(bar && text) {
            bar.style.width = `${percent}%`;
            let hue = 120 - (percent * 1.2); 
            bar.style.background = `hsl(${hue}, 100%, 50%)`;
            text.innerText = vals[i].toFixed(2);
        }
    }
  }

  applyToSimulation(vals) {
    window.wire2_Up = vals[0]; window.wire2_Down = vals[1];
    window.wire2_Left = vals[2]; window.wire2_Right = vals[3];
    window.wire1_Up = vals[4]; window.wire1_Down = vals[5];
    window.wire1_Left = vals[6]; window.wire1_Right = vals[7];
  }
  
  log(msg) { console.log(msg); }
  setStatus(msg) { const el = document.getElementById('status-box'); if(el) el.innerText = "상태: " + msg; }

  // ----------------------------------------------------------------
  // [새로운 기능] 키보드 입력으로 타겟 좌표 변경
  // ----------------------------------------------------------------
  adjustTargetPos(axis, direction) {
    if (!this.isPredicting) return; // 예측 모드가 아니면 작동하지 않음
    
    const inputElement = document.getElementById(`in${axis}`);
    if (!inputElement) return;

    let currentValue = parseFloat(inputElement.value);
    // 이동 스텝 (예: 한 번 누를 때마다 5 단위 이동)
    const step = 5.0; 
    
    let newValue = currentValue + (direction * step);

    // 슬라이더 min/max 범위 제한 적용 (HTML input의 제한에 의존)
    const minVal = parseFloat(inputElement.min);
    const maxVal = parseFloat(inputElement.max);
    
    newValue = Math.max(minVal, Math.min(maxVal, newValue));

    inputElement.value = newValue;
  }
}

window.aiManager = new AIManager();