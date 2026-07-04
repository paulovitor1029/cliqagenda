export type Permissions = Record<string, boolean>;

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: Permissions;
}

export interface Theme {
  primary?: string;
  primaryDark?: string;
  background?: string;
  card?: string;
  text?: string;
  muted?: string;
  line?: string;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  whatsapp: string;
  businessType: string;
  address: string;
  description: string;
  photoUrl: string;
  theme: Theme;
  deposit: number;
  pixKey: string;
  cancellationHours: number;
  rescheduleHours: number;
  allowClientCancel: boolean;
  allowClientReschedule: boolean;
  workingHours: string[];
}

export interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
  interval: number;
  hours: string[];
}

export interface Professional {
  id: string;
  name: string;
  specialty: string;
  photoUrl: string;
  active: boolean;
  workingDays: number[];
  workingSchedule: Record<string, DaySchedule>;
  workingHours: string[];
}

export interface Service {
  id: string;
  professionalId: string;
  professionalName: string;
  name: string;
  price: number;
  duration: number;
  buffer: number;
  active: boolean;
}

export interface Appointment {
  id: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  service: string;
  price: number;
  total: number;
  date: string;
  time: string;
  customer: string;
  phone: string;
  coupon: string;
  recurrence: number;
  code: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleBlock {
  id: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  reason: string;
  professionalId: string;
}

export interface WaitlistEntry {
  id: string;
  name: string;
  phone: string;
  date: string;
  period: string;
  service: string;
}

export interface Payment {
  id: string;
  appointmentId: string;
  status: string;
  amount: number;
  pixKey: string;
  pixCopyPaste: string;
  expiresAt: string;
  createdAt: string;
}

export interface Finance {
  grossRevenue: number;
  paidRevenue: number;
  pendingPix: number;
  appointments: number;
  activeAppointments: number;
  payments: Payment[];
}

export interface AdminBundle {
  user: User;
  business: Business;
  professionals: Professional[];
  services: Service[];
  appointments: Appointment[];
  waitlist: WaitlistEntry[];
  blocks: ScheduleBlock[];
  users: User[];
  payments: Payment[];
  finance: Finance;
}

export interface PublicBundle {
  business: Business;
  professionals: Professional[];
  services: Service[];
  blocks: ScheduleBlock[];
}
