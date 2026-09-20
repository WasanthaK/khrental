import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getPlatformAdminStatus } from '../services/tenantAdminService';

const usePlatformAdminStatus = () => {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setIsPlatformAdmin(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const status = await getPlatformAdminStatus();
        if (!cancelled) {
          setIsPlatformAdmin(Boolean(status?.isPlatformAdmin));
        }
      } catch (_error) {
        if (!cancelled) {
          setIsPlatformAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { isPlatformAdmin, loading };
};

export default usePlatformAdminStatus;
