import React from 'react';
import { useParams } from 'react-router-dom';
import AgreementFormContainer from '../components/agreements/AgreementFormContainer';

const AgreementFormPage = () => {
  const { id } = useParams();
  return <AgreementFormContainer agreementId={id} />;
};

export default AgreementFormPage; 