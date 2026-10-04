import { Component } from 'react'
import { recoverApp } from '../lib/recover'

// من غير الحارس ده أي استثناء أثناء رسم أي شاشة (أو فشل تحميل شاشة lazy بعد تحديث) كان بيشيل React
// كله من الصفحة = شاشة بيضا من غير أي رسالة. هنا بنحاول نصلّح تلقائي مرة (مسح كاش + ريلود)، ولو
// المشكلة فضلت بنعرض رسالة وزرار بدل الفراغ، ومعاها نص الخطأ عشان نعرف السبب
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('UI crashed:', error)
    recoverApp()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#16161A', color: '#e5e7eb', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 360 }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>حصلت مشكلة في تحميل البرنامج</p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>اضغط الزرار، وده هيحدّث البرنامج من غير ما يخرّجك من حسابك</p>
          <button onClick={() => recoverApp({ force: true })}
            style={{ padding: '10px 20px', borderRadius: 10, border: 0, background: '#6366f1', color: '#fff', fontSize: 14 }}>
            تحديث البرنامج
          </button>
          <p dir="ltr" style={{ fontSize: 10, color: '#6b7280', marginTop: 16, wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error).slice(0, 200)}</p>
        </div>
      </div>
    )
  }
}
