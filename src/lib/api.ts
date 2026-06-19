import axios from 'axios';

export const api = axios.create({
  baseURL: '/',
  withCredentials: true,
});

export const login = (email: string) =>
  api.post('/auth/login', { email }).then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);
export const logout = () => api.post('/auth/logout');
export const getStaffColors = () => api.get('/auth/staff_colors').then(r => r.data);
export const setStaffColor = (staffId: string, color: string) =>
  api.put(`/auth/staff_colors/${staffId}`, { color }).then(r => r.data);

export const getSchedules = () => api.get('/schedules').then(r => r.data);
export const searchSchedules = (q: string) =>
  api.get('/schedules/search', { params: { q } }).then(r => r.data);
export const getSchedulesByRange = (from: Date, to: Date) =>
  api
    .get('/schedules/range', { params: { from: from.toISOString(), to: to.toISOString() } })
    .then(r => r.data);
export const getSchedule = (id: number) => api.get(`/schedules/${id}`).then(r => r.data);
export const createSchedule = (data: unknown) =>
  api.post('/schedules', data).then(r => r.data);
export const updateSchedule = (id: number, data: unknown) =>
  api.put(`/schedules/${id}`, data).then(r => r.data);
export const updateScheduleStatus = (id: number, status: string) =>
  api.patch(`/schedules/${id}/status`, { status }).then(r => r.data);
export const deleteSchedule = (id: number) => api.delete(`/schedules/${id}`);

export const getCalendarSources = () => api.get('/google/calendars').then(r => r.data);
export const addCalendarSource = (calendarId: string, label: string) =>
  api.post('/google/calendars', { calendarId, label }).then(r => r.data);
export const deleteCalendarSource = (id: number) => api.delete(`/google/calendars/${id}`);

export const getProducts = () => api.get('/smaregi/products').then(r => r.data);
export const searchProducts = (q: string) =>
  api.get('/smaregi/products/search', { params: { q } }).then(r => r.data);
export const getStores = () => api.get('/smaregi/stores').then(r => r.data);
export const getStaffs = () => api.get('/smaregi/staffs').then(r => r.data);
export const getCustomers = () => api.get('/smaregi/customers').then(r => r.data);
export const searchCustomers = (q: string) =>
  api.get('/smaregi/customers/search', { params: { q } }).then(r => r.data);
