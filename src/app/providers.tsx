'use client';

import { Toaster } from 'react-hot-toast';
import 'sweetalert2/dist/sweetalert2.min.css';
import { AuthProvider } from '@/components/AuthContext';
import { CalendarProvider } from '@/components/CalendarContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CalendarProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '14px',
              background: '#111827',
              color: '#ffffff',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.18)',
            },
            success: { style: { background: '#065f46' } },
            error: { style: { background: '#b91c1c' } },
          }}
        />
      </CalendarProvider>
    </AuthProvider>
  );
}
