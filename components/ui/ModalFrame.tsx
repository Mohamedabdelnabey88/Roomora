"use client";

import { useEffect,type ReactNode } from "react";
import { AnimatePresence,motion } from "framer-motion";

export default function ModalFrame({
  open,
  onClose,
  className="",
  ariaLabelledBy,
  children
}:{
  open:boolean;
  onClose:()=>void;
  className?:string;
  ariaLabelledBy?:string;
  children:ReactNode;
}){
  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()};
    window.addEventListener("keydown",onKey);
    return()=>{
      document.body.style.overflow=previous;
      window.removeEventListener("keydown",onKey);
    };
  },[open,onClose]);

  return <AnimatePresence>
    {open?<>
      <motion.div
        className="overlay modal-overlay"
        initial={{opacity:0}}
        animate={{opacity:1}}
        exit={{opacity:0}}
        onClick={onClose}
      />
      <div className="modal-viewport" role="presentation">
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          className={"operation-modal modal-surface "+className}
          initial={{opacity:0,y:14,scale:.985}}
          animate={{opacity:1,y:0,scale:1}}
          exit={{opacity:0,y:10,scale:.99}}
          transition={{duration:.18,ease:[.2,.8,.2,1]}}
        >
          {children}
        </motion.section>
      </div>
    </>:null}
  </AnimatePresence>;
}
