/* 手写板组件（M2.2）：canvas 2d 手写 + 背景格线（田字格/四线三格）
   页面通过 selectComponent("#hw") 调用：clear() / isEmpty() / exportImage() */
Component({
  properties: {
    bg: { type: String, value: "tianzige" }, // tianzige | fourline
  },

  data: {
    canvasId: "",
  },

  lifetimes: {
    attached() {
      this.setData({
        canvasId: "hw_" + Math.random().toString(36).slice(2, 8),
      });
      this.strokes = 0;
      this.last = null;
    },
    ready() {
      this.initCanvas();
    },
  },

  methods: {
    initCanvas() {
      const query = this.createSelectorQuery();
      query
        .select("#" + this.data.canvasId)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) return;
          const { node, width, height } = res[0];
          let dpr = 2;
          try {
            dpr = wx.getWindowInfo().pixelRatio || 2;
          } catch (e) {
            dpr = (wx.getSystemInfoSync() || {}).pixelRatio || 2;
          }
          node.width = width * dpr;
          node.height = height * dpr;
          const ctx = node.getContext("2d");
          ctx.scale(dpr, dpr);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          this.canvas = node;
          this.ctx = ctx;
          this.w = width;
          this.h = height;
          this.drawBg();
        });
    },

    /* 画背景格线（重绘即清空） */
    drawBg() {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.fillStyle = "#FDFCF7";
      ctx.fillRect(0, 0, this.w, this.h);
      if (this.data.bg === "fourline") {
        // 四线三格：4 条横线，上 1/4.5 起点
        const top = this.h * 0.28;
        const gap = (this.h * 0.44) / 3;
        ctx.strokeStyle = "#8FBFA3";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(16, top + i * gap);
          ctx.lineTo(this.w - 16, top + i * gap);
          ctx.stroke();
        }
      } else {
        // 田字格：红外框 + 虚线十字
        const pad = 10;
        ctx.strokeStyle = "#D9534F";
        ctx.lineWidth = 2;
        ctx.strokeRect(pad, pad, this.w - pad * 2, this.h - pad * 2);
        ctx.strokeStyle = "#EBA6A3";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(this.w / 2, pad);
        ctx.lineTo(this.w / 2, this.h - pad);
        ctx.moveTo(pad, this.h / 2);
        ctx.lineTo(this.w - pad, this.h / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },

    /* ---------- 手写 ---------- */
    onStart(e) {
      const t = e.touches[0];
      this.last = { x: t.x, y: t.y };
    },

    onMove(e) {
      if (!this.last || !this.ctx) return;
      const t = e.touches[0];
      const ctx = this.ctx;
      ctx.strokeStyle = "#2B3A55";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(this.last.x, this.last.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      this.last = { x: t.x, y: t.y };
      this.strokes += 0.01; // move 计数近似笔画长度
    },

    onEnd() {
      if (this.last) this.strokes += 1;
      this.last = null;
    },

    clear() {
      this.strokes = 0;
      this.drawBg();
    },

    isEmpty() {
      return this.strokes < 1;
    },

    /* 导出手写图（含背景），供 OCR */
    exportImage() {
      return new Promise((resolve, reject) => {
        if (!this.canvas) {
          reject(new Error("画布未就绪"));
          return;
        }
        wx.canvasToTempFilePath({
          canvas: this.canvas,
          fileType: "png",
          success: (r) => resolve(r.tempFilePath),
          fail: (e) => reject(new Error(e.errMsg || "导出失败")),
        });
      });
    },
  },
});
