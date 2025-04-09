# KH Rentals Database Schema

## Main Tables

### properties
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| name | character varying |
| address | text |
| unitconfiguration | character varying |
| rentalvalues | jsonb |
| checklistitems | ARRAY |
| terms | jsonb |
| status | character varying |
| images | ARRAY |
| description | text |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |
| availablefrom | timestamp with time zone |
| propertytype | character varying |
| squarefeet | numeric |
| yearbuilt | integer |
| amenities | ARRAY |

### property_units
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| propertyid | uuid |
| unitnumber | character varying |
| floor | character varying |
| size | numeric |
| bedrooms | integer |
| bathrooms | integer |
| rentalvalues | jsonb |
| status | character varying |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### rentees
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| name | character varying |
| contactdetails | jsonb |
| idcopyurl | text |
| associatedpropertyids | ARRAY |
| registrationdate | timestamp with time zone |
| updatedat | timestamp with time zone |

### agreements
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| templateid | uuid |
| renteeid | uuid |
| propertyid | uuid |
| status | character varying |
| signeddate | timestamp with time zone |
| startdate | date |
| enddate | date |
| eviasignreference | character varying |
| documenturl | text |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |
| terms | jsonb |
| notes | text |

### agreement_templates
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| language | character varying |
| content | text |
| version | character varying |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |
| name | character varying |
| templateid | uuid |

### invoices
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| renteeid | uuid |
| propertyid | uuid |
| billingperiod | character varying |
| components | jsonb |
| totalamount | numeric |
| status | character varying |
| paymentproofurl | text |
| paymentdate | timestamp with time zone |
| duedate | date |
| notes | text |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### payments
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| invoiceid | uuid |
| amount | numeric |
| paymentmethod | character varying |
| transactionreference | character varying |
| paymentdate | timestamp with time zone |
| status | character varying |
| notes | text |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |
| paymentproof | text |

### action_records
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| propertyid | uuid |
| renteeid | uuid |
| actiontype | character varying |
| amount | numeric |
| status | character varying |
| date | date |
| comments | text |
| relateddocs | ARRAY |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### maintenance_requests
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| propertyid | uuid |
| renteeid | uuid |
| requesttype | character varying |
| description | text |
| priority | character varying |
| status | character varying |
| images | ARRAY |
| assignedto | uuid |
| scheduleddate | timestamp with time zone |
| completeddate | timestamp with time zone |
| notes | text |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |
| title | character varying |
| propertyunitid | uuid |
| scheduledenddate | timestamp with time zone |
| completiondetails | jsonb |
| cancellationreason | text |

### scheduled_tasks
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| propertyid | uuid |
| tasktype | character varying |
| frequency | character varying |
| description | text |
| assignedteam | character varying |
| lastcompleteddate | timestamp with time zone |
| nextduedate | timestamp with time zone |
| status | character varying |
| notes | text |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### team_members
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| name | character varying |
| role | character varying |
| contactdetails | jsonb |
| skills | ARRAY |
| availability | jsonb |
| notes | text |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### task_assignments
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| teammemberid | uuid |
| tasktype | character varying |
| tasktitle | character varying |
| taskdescription | text |
| status | character varying |
| priority | character varying |
| duedate | timestamp with time zone |
| completiondate | timestamp with time zone |
| notes | text |
| relatedentitytype | character varying |
| relatedentityid | uuid |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### cameras
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| propertyid | uuid |
| locationdescription | text |
| cameratype | character varying |
| installationdetails | text |
| datapackageinfo | jsonb |
| status | character varying |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### camera_monitoring
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| cameraid | uuid |
| monitoringdate | date |
| statusupdate | character varying |
| notes | text |
| createdat | timestamp with time zone |

### utility_readings
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| renteeid | uuid |
| propertyid | uuid |
| utilitytype | character varying |
| previousreading | numeric |
| currentreading | numeric |
| readingdate | date |
| photourl | text |
| calculatedbill | numeric |
| status | character varying |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### utility_configs
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| utilitytype | character varying |
| billingtype | character varying |
| rate | numeric |
| fixedamount | numeric |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |
| propertyid | uuid |

### letter_templates
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| type | character varying |
| subject | character varying |
| content | text |
| language | character varying |
| version | character varying |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone |

### sent_letters
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| templateid | uuid |
| renteeid | uuid |
| propertyid | uuid |
| sentdate | timestamp with time zone |
| channel | character varying |
| status | character varying |
| content | text |
| createdat | timestamp with time zone |

### users
| column_name | data_type |
|-------------|-----------|
| id | uuid |
| email | character varying |
| passwordhash | character varying |
| role | character varying |
| isactive | boolean |
| lastlogin | timestamp with time zone |
| createdat | timestamp with time zone |
| updatedat | timestamp with time zone | 