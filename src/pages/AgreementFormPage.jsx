import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import AgreementFormContainer from '../components/agreements/AgreementFormContainer';
import TenancyExit from './TenancyExit';

const AgreementFormPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  if (id && searchParams.get('workspace') === 'exit') {
    return <TenancyExit />;
  }

  return <AgreementFormContainer agreementId={id} />;
};

export default AgreementFormPage;
