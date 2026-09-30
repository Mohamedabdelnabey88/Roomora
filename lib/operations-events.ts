export const OPERATIONS_CHANGED_EVENT = "roomora:operations-changed";

export function notifyOperationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPERATIONS_CHANGED_EVENT));
  try {
    localStorage.setItem("roomora:operations-version", String(Date.now()));
  } catch {}
}

export function subscribeOperationsChanged(callback:()=>void) {
  if (typeof window === "undefined") return () => {};

  const onCustom=()=>callback();
  const onStorage=(event:StorageEvent)=>{
    if(event.key==="roomora:operations-version") callback();
  };
  const onFocus=()=>callback();
  const onPageShow=()=>callback();
  const onVisibility=()=>{
    if(document.visibilityState==="visible") callback();
  };

  window.addEventListener(OPERATIONS_CHANGED_EVENT,onCustom);
  window.addEventListener("storage",onStorage);
  window.addEventListener("focus",onFocus);
  window.addEventListener("pageshow",onPageShow);
  document.addEventListener("visibilitychange",onVisibility);

  return ()=>{
    window.removeEventListener(OPERATIONS_CHANGED_EVENT,onCustom);
    window.removeEventListener("storage",onStorage);
    window.removeEventListener("focus",onFocus);
    window.removeEventListener("pageshow",onPageShow);
    document.removeEventListener("visibilitychange",onVisibility);
  };
}
