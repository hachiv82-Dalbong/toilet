// 하단 카드 접기/펼치기. 카드를 끌거나 손잡이를 누르면 지도를 크게 볼 수 있다.

const DRAG_THRESHOLD_PX = 30;
const TAP_SLOP_PX = 8;

export function nextCollapsed(collapsed, dragY) {
  if (dragY > DRAG_THRESHOLD_PX) return true;
  if (dragY < -DRAG_THRESHOLD_PX) return false;
  return collapsed;
}

// 길찾기 링크 같은 조작 요소는 그대로 눌려야 하고, 내용이 길어 스크롤되는 카드는 스크롤을 막지 않는다.
export function startsDrag(target, handle, scrollable) {
  if (handle.contains(target)) return true;
  if (target.closest("a, button")) return false;
  return !scrollable;
}

export function attachSheet(sheet, handle) {
  let collapsed = false;
  let startY = null;
  let dragged = false;

  const setCollapsed = (value) => {
    collapsed = value;
    sheet.classList.toggle("collapsed", value);
    handle.setAttribute("aria-expanded", String(!value));
    handle.setAttribute("aria-label", value ? "카드 펼치기" : "카드 접기");
  };

  const begin = (y, target) => {
    if (!startsDrag(target, handle, sheet.scrollHeight > sheet.clientHeight)) return false;
    startY = y;
    dragged = false;
    sheet.classList.add("dragging");
    return true;
  };
  const move = (y) => {
    const dy = y - startY;
    if (Math.abs(dy) > TAP_SLOP_PX) dragged = true;
    // 펼친 상태에서 아래로 끌 때 카드가 손가락을 따라오게 한다
    sheet.style.transform = dy > 0 && !collapsed ? `translateY(${dy}px)` : "";
  };
  const stop = () => {
    startY = null;
    sheet.classList.remove("dragging");
    sheet.style.transform = "";
  };
  const finish = (y) => {
    const dy = y - startY;
    stop();
    if (dragged) setCollapsed(nextCollapsed(collapsed, dy));
  };

  // 손가락은 터치 이벤트로 직접 받는다. 아이폰 Safari에서 포인터 이벤트만으로는 끌기가 끊길 수 있다.
  sheet.addEventListener("touchstart", (e) => begin(e.touches[0].clientY, e.target), { passive: true });
  sheet.addEventListener(
    "touchmove",
    (e) => {
      if (startY === null) return;
      e.preventDefault(); // 끄는 동안 페이지가 함께 움직이지 않게 한다
      move(e.touches[0].clientY);
    },
    { passive: false }
  );
  sheet.addEventListener("touchend", (e) => {
    if (startY !== null) finish(e.changedTouches[0].clientY);
  });
  sheet.addEventListener("touchcancel", () => {
    if (startY !== null) stop();
  });

  // 마우스는 포인터 이벤트로 받는다
  sheet.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" && begin(e.clientY, e.target)) sheet.setPointerCapture?.(e.pointerId);
  });
  sheet.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch" && startY !== null) move(e.clientY);
  });
  sheet.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch" && startY !== null) finish(e.clientY);
  });
  sheet.addEventListener("pointercancel", (e) => {
    if (e.pointerType !== "touch" && startY !== null) stop();
  });

  // 끌지 않고 누르기만 했을 때(키보드 포함) 전환한다
  handle.addEventListener("click", () => {
    if (!dragged) setCollapsed(!collapsed);
    dragged = false;
  });

  setCollapsed(false);
  return { expand: () => setCollapsed(false) };
}
