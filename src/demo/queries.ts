// ─── Biomed Field Copilot - Demo Query Battery ───
// Standard queries for the reproducible demo run.

import type { DemoQuery } from '../types.js';

export const DEMO_QUERIES: DemoQuery[] = [
  {
    id: 'tech-01',
    query:
      'The SpO2 readings on our patient monitor are showing intermittent "probe off" errors even though the sensor is properly connected to the patient. What should I check?',
    expectedCategory: 'wiring_connector', // Fixed category
    description: 'Pulse oximeter troubleshooting - probe off errors',
    documentId: 'D3D2 Service Manual_2.0_EN.pdf',
  },
  {
    id: 'tech-02',
    query:
      'Our infusion pump is showing an "occlusion" alarm but the IV line appears completely clear with no visible kinks. How do I troubleshoot this?',
    expectedCategory: 'internal_module',
    description: 'Infusion pump occlusion alarm troubleshooting',
    documentId: 'MT 52000.pdf',
  },
  {
    id: 'tech-03',
    query:
      'I am getting an error code E-22 on the patient monitor. What does this mean and how do I fix it?',
    expectedCategory: 'error_code',
    description: 'Error code lookup and troubleshooting',
    documentId: 'D3D2 Service Manual_2.0_EN.pdf',
  },
  {
    id: 'tech-04',
    query:
      'The monitor turns on but powers off randomly after 30 seconds to 2 minutes. The battery shows 80% charge.',
    expectedCategory: 'power_source',
    description: 'Intermittent power issue troubleshooting',
    documentId: 'D3D2 Service Manual_2.0_EN.pdf',
  },
  {
    id: 'tech-05',
    query:
      'The SpO2 module calibration failed verification during preventive maintenance. The readings are out of tolerance by 4%.',
    expectedCategory: 'calibration',
    description: 'Calibration failure analysis',
    documentId: 'D3D2 Service Manual_2.0_EN.pdf',
  },
  {
    id: 'tech-06',
    query:
      'The alarm limits reset to factory defaults every time the device is power cycled. Is this normal?',
    expectedCategory: 'configuration_use',
    description: 'Configuration persistence issue',
    documentId: 'D3D2 Service Manual_2.0_EN.pdf',
  },
  {
    id: 'tech-07-es',
    query:
      'La bomba marca oclusión pero la línea está libre y los settings de presión de oclusión están configurados al mínimo.',
    expectedCategory: 'configuration_use',
    description: 'Spanish ambiguous query: configuration vs hardware',
    documentId: 'MT 52000.pdf',
  },
  {
    id: 'med-01',
    query:
      'What are the clinical risks if a mechanical ventilator delivers incorrect tidal volumes to a patient? Why is this dangerous?',
    expectedCategory: 'false_clinical_problem',
    description: 'Clinical question boundary test',
    documentId: 'D3D2 Service Manual_2.0_EN.pdf', // Needed for orchestrator bypass check
  },
];
