// ==========================================
// [serial.js] - Web Serial API Controller
// ==========================================

class SerialController {
  constructor() {
    this.port = null;
    this.writer = null;
    this.isConnected = false;
  }

  // [연결] 사용자가 포트를 선택하고 연결
  async connect() {
    if (!navigator.serial) {
      alert("이 브라우저는 Web Serial API를 지원하지 않습니다. Chrome이나 Edge를 사용하세요.");
      return;
    }

    try {
      // 포트 선택 팝업
      this.port = await navigator.serial.requestPort();
      
      // 포트 열기 (BaudRate 115200 필수)
      await this.port.open({ baudRate: 115200 });
      
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
      this.writer = textEncoder.writable.getWriter();
      
      this.isConnected = true;
      console.log("🔌 Serial Connected!");
      alert("ESP32와 연결되었습니다!");
      
      // 연결 성공 시 버튼 스타일 변경 (선택 사항)
      const btn = document.getElementById('btnConnect');
      if(btn) {
        btn.innerText = "✅ Connected";
        btn.style.background = "#2E7D32";
      }

    } catch (error) {
      console.error("Serial Connection Failed:", error);
      alert("연결에 실패했거나 취소되었습니다.");
    }
  }

  // [전송] 데이터를 문자열로 전송
  async write(data) {
    if (this.port && this.writer) {
      try {
        // 데이터 끝에 개행문자(\n) 추가하여 전송
        await this.writer.write(data + "\n");
      } catch (error) {
        console.error("Write Error:", error);
      }
    }
  }
}

// 전역 인스턴스 생성 (다른 파일에서 사용 가능하도록)
const serialCtrl = new SerialController();