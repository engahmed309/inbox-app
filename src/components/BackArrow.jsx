import { ArrowRight, ArrowLeft } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

export default function BackArrow({ size = 20 }) {
  const { language } = useLanguage()
  return language === 'en' ? <ArrowLeft size={size} /> : <ArrowRight size={size} />
}
