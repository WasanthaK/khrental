import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { platform as platformClient } from '../../services/platformClient';
import AgreementFormUI from './AgreementFormUI';
import SignatureForm from './SignatureForm.jsx';
import { AGREEMENT_STATUS } from '../../constants/agreementStatus';
import {
  fetchAgreement as fetchAgreementRecord,
  updateAgreementData
} from '../../services/agreementService';
import {
  generateAndAttachAgreementDocument,
  saveAgreementForStatus
} from '../../services/agreementWorkflowService';
import { findAppUserByAuthId } from '../../services/appUserService';

const normalizeAgreementRecord = (record) => {
  if (!record) {
    return record;
  }

  return {
    ...record,
    processedContent: record.processedContent ?? record.processedcontent ?? null,
    signedDocumentUrl: record.signedDocumentUrl ?? record.signed_document_url ?? record.signeddocumenturl ?? null
  };
};

const AgreementFormContainer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSignatureForm, setShowSignatureForm] = useState(false);
  const [formDataToSign, setFormDataToSign] = useState(null);
  const [agreement, setAgreement] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadUserData = async () => {
      try {
        const { data: { user } } = await platformClient.auth.getUser();
        if (!user) {
          throw new Error('User not found');
        }

        const appUserResult = await findAppUserByAuthId(user.id);
        if (!appUserResult?.success || !appUserResult.data) {
          throw new Error(appUserResult?.error || 'App user profile not found');
        }

        if (!cancelled) {
          setCurrentUser(appUserResult.data);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        if (!cancelled) {
          toast.error('Failed to load user data');
        }
      }
    };

    const loadAgreement = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const data = normalizeAgreementRecord(await fetchAgreementRecord(id));
        if (!data) {
          throw new Error('Agreement not found');
        }

        if (!cancelled) {
          setInitialData(data);
          setAgreement(data);
        }
      } catch (error) {
        console.error('Error loading agreement:', error);
        if (!cancelled) {
          toast.error('Failed to load agreement');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadUserData();
    loadAgreement();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const storeAgreementState = (record) => {
    const normalized = normalizeAgreementRecord(record);
    setAgreement(normalized);
    setInitialData(normalized);
    return normalized;
  };

  const getExistingAgreementId = (formData) => formData?.id || id || agreement?.id || null;

  const handleSubmit = async (formData, status = AGREEMENT_STATUS.DRAFT) => {
    try {
      const existingId = getExistingAgreementId(formData);

      if (status === AGREEMENT_STATUS.PENDING) {
        const savedDraft = await saveAgreementForStatus({
          formData,
          status: AGREEMENT_STATUS.DRAFT,
          existingId
        });

        const normalizedDraft = storeAgreementState(savedDraft);
        setFormDataToSign({
          ...formData,
          id: normalizedDraft.id,
          processedContent: normalizedDraft.processedcontent || formData.processedContent || null
        });
        setShowSignatureForm(true);
        toast.success('Agreement saved. Add signatories to continue.');
        return;
      }

      const savedAgreement = await saveAgreementForStatus({
        formData,
        status,
        existingId
      });

      const normalizedAgreement = storeAgreementState(savedAgreement);
      toast.success(status === AGREEMENT_STATUS.REVIEW
        ? 'Agreement generated and saved for review'
        : 'Agreement saved successfully');

      if (!id) {
        navigate('/dashboard/agreements');
      } else {
        navigate(`/dashboard/agreements/${normalizedAgreement.id}`);
      }
    } catch (error) {
      console.error('Error handling agreement submission:', error);
      toast.error('Failed to save agreement: ' + error.message);
    }
  };

  const handleSignatureFormSuccess = async (signatureData) => {
    try {
      if (!agreement?.id) {
        throw new Error('Agreement ID is missing');
      }

      if (!signatureData?.signatories?.length) {
        throw new Error('At least one signatory is required');
      }

      const documentAgreement = normalizeAgreementRecord(await generateAndAttachAgreementDocument({
        agreement
      }));
      storeAgreementState(documentAgreement);

      const documentUrl = documentAgreement.documenturl;
      if (!documentUrl || typeof documentUrl !== 'string' || !documentUrl.startsWith('http')) {
        throw new Error('Generated agreement document URL is invalid');
      }

      const { sendDocumentForSignature } = await import('../../services/eviaSignService');
      const webhookUrl = import.meta.env.VITE_EVIA_WEBHOOK_URL || null;
      if (!webhookUrl) {
        console.warn('No Evia webhook URL configured. Status updates will require manual refresh.');
      }

      const signatureResult = await sendDocumentForSignature({
        documentUrl,
        title: signatureData.title || 'Rental Agreement',
        message: signatureData.message || 'Please sign this rental agreement',
        signatories: signatureData.signatories,
        webhookUrl,
        completedDocumentsAttached: true,
        agreementId: agreement.id
      });

      if (!signatureResult?.success) {
        throw new Error(signatureResult?.error || 'Failed to send document for signature');
      }

      const updatedAgreement = normalizeAgreementRecord(await updateAgreementData(agreement.id, {
        status: AGREEMENT_STATUS.PENDING,
        eviasignreference: signatureResult.requestId || null,
        signature_status: 'pending',
        signature_sent_at: new Date().toISOString()
      }));

      storeAgreementState(updatedAgreement);
      setShowSignatureForm(false);
      toast.success('Agreement sent for signature successfully');
      navigate('/dashboard/agreements');
    } catch (error) {
      console.error('Error sending agreement for signature:', error);
      toast.error('Failed to send for signature: ' + error.message);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (id && initialData) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [id, initialData]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading agreement data...</p>
        </div>
      </div>
    );
  }

  if (showSignatureForm) {
    return (
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md w-full max-w-full overflow-x-auto">
        <SignatureForm
          agreement={agreement}
          currentUser={currentUser}
          formData={formDataToSign}
          onSuccess={handleSignatureFormSuccess}
          onCancel={() => setShowSignatureForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md w-full max-w-full overflow-hidden">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {id ? 'Edit Agreement' : 'Create New Agreement'}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {id
            ? 'Update the details of this rental agreement'
            : 'Fill in the details to create a new rental agreement'}
        </p>
      </div>

      <AgreementFormUI
        initialData={initialData}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/dashboard/agreements')}
      />
    </div>
  );
};

export default AgreementFormContainer;
