import OEEDashboard from '@/components/OEEDashboard'

export const metadata = {
  title: 'OEE Dashboard — Ponorogo | PMP Ice Plant',
}

export default function PonorgoPage() {
  return <OEEDashboard plantCode="ponorogo" />
}
