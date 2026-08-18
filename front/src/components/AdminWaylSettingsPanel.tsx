import { AdminGatewaySettingsPanel } from './AdminGatewaySettingsPanel'

export function AdminWaylSettingsPanel() {
  return (
    <AdminGatewaySettingsPanel
      provider="wayl"
      title="إعدادات Wayl"
      description="مفاتيح Test و Production محفوظة منفصلة. بدّل البيئة النشطة دون إعادة إدخال المفاتيح."
      defaultBaseUrl="https://api.thewayl.com"
      withMerchant={false}
    />
  )
}
