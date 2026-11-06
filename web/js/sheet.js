// 하단 카드 접기/펼치기. 카드 어디든 위아래로 끌면 손가락을 따라 움직이고, 놓으면 제자리로 미끄러진다.
// 카드 위의 조작은 카드에서 끝낸다. 지도는 지도 영역에서만 움직인다.

const DRAG_THRESHOLD_PX = 30;
const TAP_SLOP_PX = 8;

export function nextCollapsed(collapsed, dragY) {
  if (dragY > DRAG_THRESHOLD_PX) return true;
  if (dragY < -DRAG_THRESHOLD_PX) return false;
  return collapsed;
}

// 내용이 길어 스크롤되는 카드만 예외다. 손잡이에서는 항상 끌 수 있다.
export function startsDrag(target, handle, scrollable) {
  return handle.contains(target) || !scrollable;
}

// 누르기만 해서는 열리거나 닫히지 않는다. 끌어야 한다. 키보드로 손잡이를 누를 때만 예외다.
export function clickAction({ dragged, onHandle, keyboard }) {
  return !dragged && onHandle && keyboard ? "toggle" : null;
}

// 카드를 아래로 밀어 낼 거리(px). 0이면 완전히 펼친 상태다.
export function sheetOffset({ height, peek, collapsed, dragY }) {
  const max = Math.max(0, height - peek);
  return Math.min(max, Math.max(0, (collapsed ? max : 0) + dragY));
}

const CARD_ONLY_EVENTS = ["touchstart", "touchmove", "touchend", "touchcancel", "pointerdown", "pointermove", "pointerup", "pointercancel", "mousedown", "mousemove", "mouseup", "wheel"];

export function attachSheet(sheet, handle) {
  let collapsed = false;
  let startY = null;
  let dragged = false;

  const scrollable = () => !collapsed && sheet.scrollHeight > sheet.clientHeight;

  // 접혔을 때 보일 높이: 화장실 이름과 거리, 또는 안내 문구까지
  const peekHeight = () => {
    const shown = sheet.querySelectorAll(".dist, .pick-hint, .status-line");
    const last = shown[shown.length - 1];
    if (!last) return sheet.offsetHeight;
    // 카드의 아래 여백에는 아이폰 홈 바 영역이 포함되어 있어 그만큼 띄운다
    const bottomSpace = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    return last.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + bottomSpace;
  };

  const place = (dragY = 0) => {
    const y = sheetOffset({ height: sheet.offsetHeight, peek: peekHeight(), collapsed, dragY });
    sheet.style.transform = y ? `translateY(${y}px)` : "";
  };

  // 긴 내용은 스크롤되어야 하므로, 스크롤이 필요할 때만 브라우저에 터치를 넘긴다
  const refresh = () => {
    sheet.style.touchAction = scrollable() ? "pan-y" : "none";
    if (startY === null) place();
  };

  const setCollapsed = (value) => {
    collapsed = value;
    sheet.classList.toggle("collapsed", value);
    if (value) sheet.scrollTop = 0;
    handle.setAttribute("aria-expanded", String(!value));
    handle.setAttribute("aria-label", value ? "카드 펼치기" : "카드 접기");
    refresh();
  };

  const begin = (y, target) => {
    dragged = false;
    if (!startsDrag(target, handle, scrollable())) return;
    startY = y;
  };
  // 끌기가 시작되면(살짝 움직인 건 누르기로 본다) true를 돌려준다
  const move = (y) => {
    const dy = y - startY;
    if (!dragged && Math.abs(dy) > TAP_SLOP_PX) {
      dragged = true;
      sheet.classList.add("dragging");
    }
    if (dragged) place(dy);
    return dragged;
  };
  const stop = () => {
    startY = null;
    sheet.classList.remove("dragging");
  };
  const finish = (y) => {
    const dy = y - startY;
    stop();
    if (dragged) setCollapsed(nextCollapsed(collapsed, dy));
  };

  // 손가락은 터치 이벤트로 직접 받는다. 터치는 카드 밖으로 나가도 시작한 곳으로 계속 전달된다.
  sheet.addEventListener("touchstart", (e) => begin(e.touches[0].clientY, e.target), { passive: true });
  sheet.addEventListener(
    "touchmove",
    (e) => {
      if (startY !== null && move(e.touches[0].clientY)) e.preventDefault();
    },
    { passive: false }
  );
  sheet.addEventListener("touchend", (e) => {
    if (startY !== null) finish(e.changedTouches[0].clientY);
  });
  sheet.addEventListener("touchcancel", () => {
    if (startY !== null) {
      stop();
      place();
    }
  });

  // 마우스는 카드 밖으로 금방 나가므로 창 전체에서 끝까지 따라간다
  sheet.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") begin(e.clientY, e.target);
  });
  const whileMouseDragging = (fn) => (e) => {
    if (e.pointerType !== "touch" && startY !== null) fn(e);
  };
  window.addEventListener("pointermove", whileMouseDragging((e) => move(e.clientY)), true);
  window.addEventListener("pointerup", whileMouseDragging((e) => finish(e.clientY)), true);
  window.addEventListener(
    "pointercancel",
    whileMouseDragging(() => {
      stop();
      place();
    }),
    true
  );

  // 끌고 난 뒤의 클릭은 어디에 떨어지든(링크, 지도) 없던 일로 한다. e.detail이 0이면 키보드로 누른 것이다.
  window.addEventListener(
    "click",
    (e) => {
      const action = clickAction({ dragged, onHandle: handle.contains(e.target), keyboard: e.detail === 0 });
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
      }
      dragged = false;
      if (action === "toggle") setCollapsed(!collapsed);
    },
    true
  );

  for (const name of CARD_ONLY_EVENTS) {
    sheet.addEventListener(name, (e) => e.stopPropagation(), { passive: true });
  }

  // 카드 내용이 바뀌면 접힌 위치도 다시 잡는다
  new MutationObserver(refresh).observe(sheet, { childList: true, subtree: true });
  new ResizeObserver(refresh).observe(sheet);

  setCollapsed(false);
  return { expand: () => setCollapsed(false) };
}
