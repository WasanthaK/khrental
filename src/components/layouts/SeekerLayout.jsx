import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import {isPropertyEnquiriesEnabled} from '../../utils/env';
import '../../styles/seeker.css';

export default function SeekerLayout({active, children}) {
  const {isAuthenticated,logout}=useAuth();
  const [error,setError]=useState('');
  return <div className="seeker-space">
    <a className="seeker-skip" href="#seeker-content">Skip to content</a>
    <header className="seeker-header">
      <Link className="seeker-brand" to="/seeker" aria-label="Quixo.Homes home">quixo<span>.</span>homes</Link>
      <nav aria-label="Your rental search" className="seeker-nav">
        {[['home','/seeker','Overview'],['enquiries','/enquire','My enquiries'],['offers','/rental-journey','Offers & agreements']].filter(([key])=>key==='home'||isPropertyEnquiriesEnabled()).map(([key,to,label])=>
          <Link key={key} to={to} aria-current={active===key?'page':undefined}>{label}</Link>)}
      </nav>
      {isAuthenticated && <button type="button" className="seeker-signout" onClick={async()=>{
        try {await logout();} catch {setError('We couldn’t sign you out. Please try again.');}
      }}>Sign out</button>}
    </header>
    <main id="seeker-content" className="seeker-content">
      {error && <p role="alert" className="seeker-alert">{error}</p>}
      {children}
    </main>
    <footer className="seeker-footer"><span>quixo.homes · A place for your next chapter.</span><a href="https://quixo.homes/">Browse rentals</a></footer>
  </div>;
}
