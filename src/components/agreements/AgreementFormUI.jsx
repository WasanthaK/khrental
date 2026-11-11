import {sanitizeHtml} from '../../utils/sanitizeHtml.js';
import React, { useState, useEffect, useRef } from 'react';
import { Form, Button, Row, Col, Card, Spinner } from 'react-bootstrap';
import { useAgreementForm } from '../../hooks/useAgreementForm';
import { AGREEMENT_STATUS } from '../../constants/agreementStatus';
import { templateField } from '../../utils/documentUtils';

const AgreementFormUI = ({ initialData, onSubmit, onCancel, readOnly = false }) => {
  const {
    formData,
    loading,
    templates,
    properties,
    propertyUnits,
    rentees,
    templateContent,
    processedContent,
    documentReady,
    documentError,
    handleInputChange,
    handlePropertyChange,
    handleTemplateChange,
    isAgreementEditable
  } = useAgreementForm(initialData);

  const editable = isAgreementEditable();
  const [submitting, setSubmitting] = useState(false);
  const [validated, setValidated] = useState(false);
  const submissionRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submissionRef.current) {
      return;
    }
    const form = e.currentTarget;
    const status = e.nativeEvent.submitter?.value === AGREEMENT_STATUS.DRAFT
      ? AGREEMENT_STATUS.DRAFT : AGREEMENT_STATUS.PENDING;
    if (!form.checkValidity()) {
      e.stopPropagation();
      setValidated(true);
      form.querySelector(':invalid')?.focus();
      return;
    }
    if (!documentReady) {
      return;
    }
    submissionRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit({ ...formData, processedContent }, status);
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center p-5"><Spinner animation="border" /></div>;
  }

  return (
    <Form noValidate validated={validated} onSubmit={handleSubmit}>
      <Card className="mb-4">
        <Card.Header>
          <h4>Agreement Details</h4>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-template">
                <Form.Label>Template</Form.Label>
                <Form.Select
                  value={formData.templateid || ''}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  disabled={readOnly || !editable}
                  required
                >
                  <option value="">Select Template</option>
                  {templates?.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  Please select a template
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-property">
                <Form.Label>Property</Form.Label>
                <Form.Select
                  value={formData.propertyid || ''}
                  onChange={(e) => handlePropertyChange(e.target.value)}
                  disabled={readOnly || !editable}
                  required
                >
                  <option value="">Select Property</option>
                  {properties?.map(property => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  Please select a property
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-unit">
                <Form.Label>Unit</Form.Label>
                <Form.Select
                  value={formData.unitid || ''}
                  onChange={(e) => handleInputChange('unitid', e.target.value)}
                  disabled={readOnly || !editable || !formData.propertyid || formData.propertyType !== 'apartment'}
                  required={formData.propertyType === 'apartment'}
                >
                  <option value="">Select Unit</option>
                  {propertyUnits?.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unitnumber}
                    </option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  {formData.propertyType === 'apartment' ? 'Please select a unit' : ''}
                </Form.Control.Feedback>
                {formData.propertyType !== 'apartment' && (
                  <Form.Text className="text-muted">
                    Unit selection not applicable for this property type. Any unit-related merge fields in the template 
                    {/* 
                      IMPORTANT: Curly braces in JSX are evaluated as JavaScript expressions.
                      When we need to display literal curly braces like template markers {{field}},
                      we must wrap them in quotes and put them inside a JavaScript expression: {"{{field}}"}
                      or use the templateField utility: {templateField('field')}
                      This prevents React from trying to evaluate "field" as a variable.
                    */}
                    (like {templateField('unitNumber')}) will be replaced with empty values.
                  </Form.Text>
                )}
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-rentee">
                <Form.Label>Rentee</Form.Label>
                <Form.Select
                  value={formData.renteeid || ''}
                  onChange={(e) => handleInputChange('renteeid', e.target.value)}
                  disabled={readOnly || !editable}
                  required
                >
                  <option value="">Select Rentee</option>
                  {readOnly&&initialData?.renteeid&&!rentees?.some(r=>String(r.id).toLowerCase()===String(initialData.renteeid).toLowerCase())&&<option value={initialData.renteeid}>{initialData.rentee?.name||'Accepted applicant'}</option>}
                  {rentees?.map(rentee => (
                    <option key={rentee.id} value={rentee.id}>
                      {rentee.name}
                    </option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  Please select a rentee
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header>
          <h4>Agreement Terms</h4>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-monthly-rent">
                <Form.Label>Monthly Rent</Form.Label>
                <Form.Control
                  type="number"
                  value={formData.terms?.monthlyRent ?? ''}
                  onChange={(e) => handleInputChange('terms.monthlyRent', e.target.value)}
                  disabled={readOnly || !editable}
                  required
                />
                <Form.Control.Feedback type="invalid">
                  Please enter the monthly rent
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-deposit">
                <Form.Label>Security Deposit</Form.Label>
                <Form.Control
                  type="number"
                  value={formData.terms?.depositAmount ?? ''}
                  onChange={(e) => handleInputChange('terms.depositAmount', e.target.value)}
                  disabled={readOnly || !editable}
                  required
                />
                <Form.Control.Feedback type="invalid">
                  Please enter the security deposit amount
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-start-date">
                <Form.Label>Start Date</Form.Label>
                <Form.Control
                  type="date"
                  value={formData.terms?.startDate || new Date().toISOString().split('T')[0]}
                  onInput={(e) => handleInputChange('terms.startDate', e.target.value)} onChange={(e) => handleInputChange('terms.startDate', e.target.value)}
                  disabled={readOnly || !editable}
                  required
                />
                <Form.Text className="text-muted">
                  {formData.terms?.startDate ? `Selected: ${new Date(formData.terms.startDate).toLocaleDateString()}` : 'Default: Today'}
                </Form.Text>
                <Form.Control.Feedback type="invalid">
                  Please select a start date
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-end-date">
                <Form.Label>End Date</Form.Label>
                <Form.Control
                  type="date"
                  value={formData.terms?.endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  onInput={(e) => handleInputChange('terms.endDate', e.target.value)} onChange={(e) => handleInputChange('terms.endDate', e.target.value)}
                  disabled={readOnly || !editable}
                  required
                  min={formData.terms?.startDate || new Date().toISOString().split('T')[0]}
                />
                <Form.Text className="text-muted">
                  {formData.terms?.endDate ? `Selected: ${new Date(formData.terms.endDate).toLocaleDateString()}` : 'Default: Today + 1 year'}
                </Form.Text>
                <Form.Control.Feedback type="invalid">
                  Please select an end date (after start date)
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-payment-due-day">
                <Form.Label>Payment Due Day</Form.Label>
                <Form.Control
                  type="number"
                  min="1"
                  max="31"
                  value={formData.terms?.paymentDueDay || ''}
                  onChange={(e) => handleInputChange('terms.paymentDueDay', e.target.value)}
                  disabled={readOnly || !editable}
                  required
                />
                <Form.Control.Feedback type="invalid">
                  Please enter a valid payment due day (1-31)
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3" controlId="agreement-notice-period">
                <Form.Label>Notice Period (days)</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  value={formData.terms?.noticePeriod ?? ''}
                  onChange={(e) => handleInputChange('terms.noticePeriod', e.target.value)}
                  disabled={readOnly || !editable}
                  required
                />
                <Form.Control.Feedback type="invalid">
                  Please enter the notice period
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col>
              <Form.Group className="mb-3" controlId="agreement-additional-terms">
                <Form.Label>Additional Terms</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={formData.terms?.additionalTerms || ''}
                  onChange={(e) => handleInputChange('terms.additionalTerms', e.target.value)}
                  disabled={readOnly || !editable}
                />
              </Form.Group>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {processedContent && (
        <div className="card mt-4">
          <div className="card-body">
            <h4>Preview</h4>
            <hr />
            <div 
              className="agreement-preview" 
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(processedContent) }}
            />
          </div>
        </div>
      )}

      {/* Add styles for the agreement preview */}
      <style>{`
        .agreement-preview {
          font-family: Arial, sans-serif;
          line-height: 1.5;
          color: #333;
        }
        .agreement-preview table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
          border: 2px solid #ddd;
        }
        .agreement-preview table th,
        .agreement-preview table td {
          border: 1px solid #ddd;
          padding: 8px;
        }
        .agreement-preview table th {
          background-color: #f8f9fa;
          font-weight: bold;
          text-align: left;
        }
        .agreement-preview ol, .agreement-preview ul {
          padding-left: 2rem;
          margin-bottom: 1rem;
        }
        .agreement-preview p {
          margin-bottom: 1rem;
        }
      `}</style>

      {editable && formData.templateid && !documentReady && (
        documentError ? (
          <div role="alert" className="mb-3">
            <p>{documentError}</p>
            <Button type="button" variant="outline-primary" onClick={() => handleTemplateChange(formData.templateid)}>
              Retry template
            </Button>
          </div>
        ) : <p role="status">Preparing the selected template and your latest details for preview…</p>
      )}
      {editable && (
        <p className="text-muted">
          Review and send saves your agreement and prepares the document automatically.
          You can check the document and recipients before sending any signing invitations.
        </p>
      )}
      <div className="d-flex flex-wrap justify-content-end gap-2" aria-busy={submitting}>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        {editable && (
          <>
            <Button variant="outline-primary" type="submit" value={AGREEMENT_STATUS.DRAFT} disabled={submitting || Boolean(formData.templateid && !documentReady)}>
              Save draft
            </Button>
            <Button variant="primary" type="submit" value={AGREEMENT_STATUS.PENDING} disabled={submitting || Boolean(formData.templateid && !documentReady)}>
              {submitting ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Preparing…</> : 'Review and send'}
            </Button>
          </>
        )}
      </div>
    </Form>
  );
};

export default AgreementFormUI;
