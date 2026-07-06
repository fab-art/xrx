export const STORAGE_KEY = 'verify-app-state-v3'
export const THEME_KEY = 'verify-app-theme'
export const APP_NAME = 'RSSB Counter Verification System'
export const SAVE_DEBOUNCE_MS = 500

export const FIELD_DEFS = [
  { key: 'voucher_no', label: 'Paper Code / Voucher No', guesses: ['papercode', 'voucheridentification', 'voucher', 'claimno', 'code', 'n0', 'no'] },
  { key: 'visit_date', label: 'Prescription Date', guesses: ['prescriptiondate', 'date', 'visit'] },
  { key: 'dispensing_date', label: 'Dispensing Date', guesses: ['dispensingdate', 'dispatchdate'] },
  { key: 'patient_name', label: 'Patient Name', guesses: ['beneficiarysnames', 'beneficiaryname', 'patient', 'name', 'beneficiary'] },
  { key: 'patient_type', label: 'Patient Type', guesses: ['patienttype', 'affiliatesaffectation', 'affectation'] },
  { key: 'gender', label: 'Gender', guesses: ['gender', 'sex', 'beneficiaryssex'] },
  { key: 'is_newborn', label: 'Is Newborn', guesses: ['isnewborn', 'newborn'] },
  { key: 'patient_age', label: 'Beneficiary Age / DOB', guesses: ['beneficiarysage', 'age', 'dob'] },
  { key: 'rama_number', label: 'RAMA / Affiliation Number', guesses: ['ramanumber', 'rama', 'affiliationnumber', 'beneficiaryaffiliationnumber', 'affiliation'] },
  { key: 'affiliate_name', label: "Affiliate's Name", guesses: ['affiliatesnames', 'affiliatename'] },
  { key: 'doctor_name', label: 'Practitioner Name', guesses: ['practitionername', 'doctor', 'practitioner', 'prescriber', 'prescribersnames'] },
  { key: 'practitioner_type', label: 'Practitioner Type', guesses: ['practitionertype', 'om'] },
  { key: 'facility_name', label: 'Health Facility', guesses: ['healthfacility', 'facility', 'pharmacy', 'hospital'] },
  { key: 'amount', label: 'Total Cost', guesses: ['totalcost100', 'totalcost', 'amount', 'total', 'cost', 'claim', 'value', 'price'] },
  { key: 'patient_copayment', label: 'Patient Co-payment', guesses: ['patientcopayment', 'patientco'] },
  { key: 'insurance_copayment', label: 'Insurance / RSSB Co-payment', guesses: ['rssbcost85', 'rssbcost', 'insuranceco', 'insurancecopayment'] },
  { key: 'difference', label: 'Difference', guesses: ['difference'] },
  { key: 'observation', label: 'Observation', guesses: ['observation', 'comment', 'remark'] }
]

export const CLASSIFICATION_DEFS = [
  { key: 'pharma', label: 'Pharmacological compliance' },
  { key: 'rssb', label: 'RSSB rules compliance' },
  { key: 'fraud', label: 'Fraud activity' }
]

export const HOSPITAL_FIELD_DEFS = [
  { key: 'hosp_id', label: 'Beneficiary Affiliation Number', guesses: ['affiliationnumber', 'beneficiarysaffiliationnumber', 'ramanumber', 'rama', 'nationalid'] },
  { key: 'hosp_name', label: "Beneficiary's Name", guesses: ['beneficiarysnames', 'beneficiaryname', 'patientname', 'name'] },
  { key: 'hosp_sex', label: 'Sex / Gender', guesses: ['beneficiaryssex', 'sex', 'gender'] },
  { key: 'hosp_dob', label: 'Age / DOB', guesses: ['beneficiarysage', 'dob', 'age', 'dateofbirth'] },
  { key: 'hosp_date', label: 'Visit / Voucher Date', guesses: ['date', 'voucherdate', 'visitdate'] }
]

export const MATCH_CATEGORIES = ['clean', 'review', 'fraud_risk', 'orphan']

export const TABS = [
  ['map', 'Map columns'],
  ['clean', 'Clean Data'],
  ['verify', 'Verify'],
  ['dashboard', 'Dashboard'],
  ['hospital', 'Hospital Data'],
  ['match', 'Match Review'],
  ['network', 'Network Analysis'],
  ['fraud', 'Fraud review'],
  ['counter', 'Counter verification']
]

export function emptyClassifications() {
  return { pharma: false, rssb: false, fraud: false }
}
