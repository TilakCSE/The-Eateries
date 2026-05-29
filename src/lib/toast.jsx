import { createContext, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ msg: '', type: '', show: false })
  const timer = useRef(null)

  function showToast(msg, type = '') {
    clearTimeout(timer.current)
    setToast({ msg, type, show: true })
    timer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2500)
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`toast${toast.show ? ' show' : ''}${toast.type ? ' ' + toast.type : ''}`}>
        {toast.msg}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
