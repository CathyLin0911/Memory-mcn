

// 影像壓縮：把長邊縮到 maxSize（例如 1800px）
function compressImage(file, maxSize = 1800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;

      // 判斷是否需要縮圖
      if (w > h && w > maxSize) {
        h = Math.round(h * (maxSize / w));
        w = maxSize;
      } else if (h >= w && h > maxSize) {
        w = Math.round(w * (maxSize / h));
        h = maxSize;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject("壓縮失敗");
          resolve(blob);
        },
        "image/jpeg",
        0.85 // JPEG 品質：0.85 是安全又漂亮
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}


/* ---- Upload Flow JS ---- */
const FN_URL = "https://opqqojiwyhwweyqbzijs.supabase.co/functions/v1/upload";

// selector 快速取 DOM
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// elements
const form           = $("#f");
const fileInput      = $("#fileInput");
const btnPickPhoto   = $("#btnPickPhoto");
const btnToPreview   = $("#btnToPreview");
const btnUpload      = $("#btnUpload");
const captionInput   = $("#caption");
const previewCaption = $("#previewCaption");
const previewImage   = $("#previewImage");
const uploadStatus   = $("#uploadStatus");

let hasPhoto = false;
let uploadAnimationTimer = null;
let uploadTextTimer = null;
let uploadDotsInterval = null;   // ⭐ 新增：控制「…」動畫的 interval


// 切換 Step 畫面 + 同時改背景透明度狀態
function showStep(n) {
  // 1. 卡片淡出 / 淡入（CSS 控制動畫）
  $$(".step").forEach(step => {
    const stepNo = step.dataset.step;

    // ⭐ 特例：進入 Step4 時，要同時顯示 Step3 + Step4
    if (n === 4 && (stepNo === "3" || stepNo === "4")) {
      step.classList.add("active");
    } else {
      step.classList.toggle("active", stepNo === String(n));
    }
  });

  // 2. 外層加上 step1/2/3/4，讓 CSS 去改 flow-bg 的 opacity
  const frame = document.querySelector(".mbu-frame");
  frame.classList.remove("step1", "step2", "step3", "step4");
  frame.classList.add(`step${n}`);
}



/* --- Step 1: 選照片 --- */
btnPickPhoto.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  hasPhoto = true;

  // 預覽圖片
  const reader = new FileReader();
  reader.onload = e => {
    previewImage.src = e.target.result;
  };
  reader.readAsDataURL(file);

  showStep(2);
});

/* --- Step 2: 輸入文字 → 預覽 --- */
btnToPreview.addEventListener("click", () => {
  if (!hasPhoto) {
    alert("請先選擇一張照片。");
    return;
  }

  const text = captionInput.value.trim();
  previewCaption.textContent =
    text || "希望記憶有勾起曾經的笑容";

  showStep(3);
});

/* --- Step 3: 上傳記憶（真正上傳 API） --- */
btnUpload.addEventListener("click", async () => {
  if (!hasPhoto) {
    alert("請先選擇一張照片。");
    return;
  }

  // 避免連點
  btnUpload.disabled = true;

  // 清掉之前可能殘留的計時器與狀態
  if (uploadAnimationTimer) clearTimeout(uploadAnimationTimer);
  if (uploadTextTimer) clearTimeout(uploadTextTimer);
  if (uploadDotsInterval) clearInterval(uploadDotsInterval);  // ⭐ 新增
  uploadAnimationTimer = null;
  uploadTextTimer = null;
  uploadDotsInterval = null;
  uploadStatus.classList.remove("fade-out", "fade-in");

  // 進入 Step4：會同時顯示 Step3 + Step4
  showStep(4);

  // ⭐ 上傳中... 動畫：點數 0 → 1 → 2 → 3 循環
  const baseText = "上傳中";
  let dotIndex = 0;

  // 先顯示一次（沒點）
  uploadStatus.textContent = baseText;

  uploadDotsInterval = setInterval(() => {
    dotIndex = (dotIndex + 1) % 4;      // 0,1,2,3
    const dots = "...".slice(0, dotIndex);
    uploadStatus.textContent = baseText + dots;
  }, 500);  // 500ms 換一次，有需要可以自己調快/調慢


  // ⭐ 這裡是 Step3 → Step4 的 5 秒「模糊＋消失」動畫時間
  uploadAnimationTimer = setTimeout(() => {
    // ⭐ 停掉「上傳中...」動畫
    if (uploadDotsInterval) {
      clearInterval(uploadDotsInterval);
      uploadDotsInterval = null;
    }

    // 1) 先讓「上傳中⋯」淡出
    uploadStatus.classList.add("fade-out");

    // 2) 等淡出動畫結束（約 0.6 秒），換字再淡入
    uploadTextTimer = setTimeout(() => {
      uploadStatus.textContent = "已收到你的記憶，它正在出現中。";
      uploadStatus.classList.remove("fade-out");
      uploadStatus.classList.add("fade-in");
    }, 700);
  }, 5000);


  // ===== 實際上傳流程 =====
  try {
    const originalFile = fileInput.files[0];

    // ⭐ 壓縮原始照片（長邊 1800px，可自行調整）
    const compressedBlob = await compressImage(originalFile, 1800);

    // ⭐ 建立新 FormData（不能再用 formData(form)，會抓到原始file）
    const formData = new FormData();
    formData.append(
      "file",
      compressedBlob,
      originalFile.name.replace(/\.[^.]+$/, ".jpg")
    );
    formData.append("caption", captionInput.value.trim());

    // ⭐ 上傳
    const res = await fetch(FN_URL, {
      method: "POST",
      body: formData
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || ("HTTP " + res.status));
    }

    // ✅ 成功的話就讓剛剛排好的 5 秒動畫自己跑完
    // 不用在這裡改文字＆動畫

  } catch (err) {
    console.error(err);

    // ❌ 如果失敗，打斷原本的動畫，改成錯誤訊息
    if (uploadAnimationTimer) clearTimeout(uploadAnimationTimer);
    if (uploadTextTimer) clearTimeout(uploadTextTimer);
    uploadAnimationTimer = null;
    uploadTextTimer = null;

    uploadStatus.classList.remove("fade-out", "fade-in");
    uploadStatus.textContent =
      "上傳失敗，請稍後再試一次。\n" + err.message;
  } finally {
    btnUpload.disabled = false;
  }
});




// ===== 字數限制：中文 14、英文 28 =====
const captionLimitTip = document.getElementById('captionLimitTip');

const maxChinese = 14;
const maxEnglish = 28;

captionInput.addEventListener('input', () => {
  const val = captionInput.value;
  let chineseCount = 0;
  let englishCount = 0;
  let result = '';
  let overLimit = false;

  for (const ch of val) {
    if (/[^\x00-\xff]/.test(ch)) {
      // 中文（全形）
      if (chineseCount + 1 > maxChinese) {
        overLimit = true;
        break;
      }
      chineseCount++;
    } else {
      // 英文、數字、符號（都算英文這邊）
      if (englishCount + 1 > maxEnglish) {
        overLimit = true;
        break;
      }
      englishCount++;
    }
    result += ch;
  }

  // ⭐ 寫回允許的內容（超過的那一段直接打不進去）
  captionInput.value = result;

  // ⭐ 顯示 / 隱藏提示
  if (overLimit) {
    captionLimitTip.style.display = 'block';
  } else {
    captionLimitTip.style.display = 'none';
  }
});
