import { Outlet } from 'react-router-dom';
import Sidebar from '../navigation/Sidebar';
import Header from '../navigation/Header';
import NavigationRegistrar from './NavigationRegistrar';

/**
 * Admin layout component with sidebar and header
 */
const AdminLayout = () => {
  return (
    <>
      <NavigationRegistrar />
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
};

export default AdminLayout; 