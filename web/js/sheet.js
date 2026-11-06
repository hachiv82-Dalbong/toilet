// 하단 카드 접기/펼치기. 손잡이를 끌거나 누르면 지도를 크게 볼 수 있다.

const DRAG_THRESHOLD_PX = 30;
const TAP_SLOP_PX = 8;

export function nextCollapsed(collapsed, dragY) {
  if (dragY > DRAG_THRESHOLD_PX) return true;
  if (dragY < -DRAG_THRESHOLD_PX) return false;
  return collapsed;
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

  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    dragged = false;
    handle.setPointerCapture?.(e.pointerId);
    sheet.classList.add("dragging");
  });
  handle.addEventListener("pointermove", (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > TAP_SLOP_PX) dragged = true;
    // 접힌 상태는 더 내려가지 않고, 펼친 상태는 더 올라가지 않게 해서 카드가 손가락을 따라오게 한다
    sheet.style.transform = dy > 0 && !collapsed ? `translateY(${dy}px)` : "";
  });
  const finish = (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    sheet.classList.remove("dragging");
    sheet.style.transform = "";
    if (dragged) setCollapsed(nextCollapsed(collapsed, dy));
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", () => {
    startY = null;
    sheet.classList.remove("dragging");
    sheet.style.transform = "";
  });
  // 끌지 않고 누르기만 했을 때(키보드 포함) 전환한다
  handle.addEventListener("click", () => {
    if (!dragged) setCollapsed(!collapsed);
    dragged = false;
  });

  setCollapsed(false);
  return { expand: () => setCollapsed(false) };
}
