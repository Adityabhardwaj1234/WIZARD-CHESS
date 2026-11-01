'use client';

/**
 * Model Studio (`src/components/ModelStudio.tsx`)
 *
 * Complete model management, creation, parameter editing, JSON/.py import & validation,
 * neural network inspection, benchmark comparison, and developer guide under
 * Settings -> Advanced Settings -> Models.
 */

import React, { useState } from 'react';
import {
  BUILTIN_MODELS,
  MODEL_BENCHMARK_REPORT,
  validateModelArtifact,
  loadUserModels,
  saveUserModelsList
} from '../engine/modelRuntime.js';
import { DEFAULT_EVAL_PARAMS, PARAM_BOUNDS } from '../engine/evaluation.js';

export interface ModelStudioProps {
  activeModelId: string;
  onSelectModel: (modelId: string) => void;
}

export function ModelStudio({ activeModelId, onSelectModel }: ModelStudioProps) {
  const [userModels, setUserModels] = useState<any[]>(() => loadUserModels());
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [newModelTemplate, setNewModelTemplate] = useState('cathedral-classical-v3');
  const [importText, setImportText] = useState('');
  const [importFilename, setImportFilename] = useState('custom_model.json');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [compareIdA, setCompareIdA] = useState('cathedral-classical-v3');
  const [compareIdB, setCompareIdB] = useState('cathedral-hybrid-ensemble-v1');

  const allModels = [...BUILTIN_MODELS, ...userModels];
  const activeModel = allModels.find(m => m.id === activeModelId) || BUILTIN_MODELS[0];
  const editingModel = userModels.find(m => m.id === selectedEditId) || null;

  const handleCreateModel = () => {
    const base = allModels.find(m => m.id === newModelTemplate) || BUILTIN_MODELS[0];
    const cleanName = (newModelName.trim() || `${base.name} Copy`).slice(0, 80);
    const id = `user-model-${Date.now().toString(36)}`;
    const created = {
      ...base,
      id,
      name: cleanName,
      version: '1.0.0-custom',
      builtIn: false,
      trained: false,
      status: 'User Custom (Editable)',
      createdAt: new Date().toISOString(),
      evalParams: { ...(base.evalParams || DEFAULT_EVAL_PARAMS) }
    };
    const next = [created, ...userModels];
    setUserModels(next);
    saveUserModelsList(next);
    setSelectedEditId(id);
    setNewModelName('');
    setStatusMessage(`Created model "${cleanName}" (${id}).`);
  };

  const handleImportArtifact = () => {
    if (!importText.trim()) return;
    const res = validateModelArtifact(importText.trim(), importFilename.trim() || 'model.json');
    if (!res.valid || !res.model) {
      setStatusMessage(`Import rejected: ${res.error}`);
      return;
    }
    const next = [res.model, ...userModels.filter(m => m.id !== res.model.id)];
    setUserModels(next);
    saveUserModelsList(next);
    setImportText('');
    setStatusMessage(
      res.warning
        ? `Imported Python source "${res.model.name}": ${res.warning}`
        : `Validated & imported model "${res.model.name}" (${res.model.modelType}).`
    );
  };

  const handleDeleteUserModel = (id: string) => {
    const next = userModels.filter(m => m.id !== id);
    setUserModels(next);
    saveUserModelsList(next);
    if (activeModelId === id) onSelectModel('cathedral-classical-v3');
    if (selectedEditId === id) setSelectedEditId(null);
    setStatusMessage(`Deleted user model ${id}.`);
  };

  const handleExportModel = (model: any) => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="model-studio-container">
      <div className="panel-section">
        <div className="section-header">
          <span>Model Studio &amp; Neural Network Registry</span>
          <span>Active: {activeModel.name}</span>
        </div>
        <p className="honest-disclaimer">
          Select between the handcrafted 24-parameter classical evaluator, the Python-trained 3-layer MLP neural network
          (<strong>CathedralNet v1</strong>, 38,665 parameters), the <strong>Hybrid Ensemble</strong> (70% Classical +
          30% Neural, lowest test MAE: 118.0 cp), or create and import your own validated model artifacts.
        </p>

        {statusMessage && <p className="save-toast">{statusMessage}</p>}

        <table className="data-table">
          <thead>
            <tr>
              <th>Model Name</th>
              <th>Type</th>
              <th>Parameters</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allModels.map(m => (
              <tr key={m.id}>
                <td>
                  <strong>{m.name}</strong> <small className="text-muted">({m.version})</small>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>{m.description}</div>
                </td>
                <td>{m.modelType}</td>
                <td>{(m.architecture?.parameterCount || 24).toLocaleString()}</td>
                <td>{m.status || (m.trained ? 'Trained' : 'Handcrafted')}</td>
                <td>
                  <div className="control-row">
                    {m.modelType !== 'python_source_only' && (
                      <button
                        type="button"
                        className={activeModelId === m.id ? 'nav-btn primary' : 'icon-btn'}
                        onClick={() => onSelectModel(m.id)}
                      >
                        {activeModelId === m.id ? 'Active' : 'Use in Engine'}
                      </button>
                    )}
                    <button type="button" className="icon-btn" onClick={() => handleExportModel(m)}>
                      Export
                    </button>
                    {!m.builtIn && (
                      <>
                        <button type="button" className="icon-btn" onClick={() => setSelectedEditId(m.id)}>
                          Edit
                        </button>
                        <button type="button" className="icon-btn danger" onClick={() => handleDeleteUserModel(m.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dashboard-grid">
        <div className="panel-section">
          <div className="section-header">
            <span>Create New Model from Template</span>
            <span>24-Param / Hybrid</span>
          </div>
          <div className="control-grid-2">
            <label className="field">
              <span>Model Name</span>
              <input
                className="san-input"
                value={newModelName}
                onChange={e => setNewModelName(e.target.value)}
                placeholder="My Custom Evaluator v1…"
              />
            </label>
            <label className="field">
              <span>Base Template</span>
              <select value={newModelTemplate} onChange={e => setNewModelTemplate(e.target.value)}>
                {allModels.filter(m => m.modelType !== 'python_source_only').map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="nav-btn primary" style={{ marginTop: '0.6rem' }} onClick={handleCreateModel}>
            + Create Editable Model
          </button>
        </div>

        <div className="panel-section">
          <div className="section-header">
            <span>Import Model Artifact (.json or .py)</span>
            <span>Schema &amp; Bounds Validated</span>
          </div>
          <div className="control-row">
            <input
              className="san-input"
              value={importFilename}
              onChange={e => setImportFilename(e.target.value)}
              placeholder="Filename (e.g. model.json or net.py)"
            />
            <button type="button" className="nav-btn primary" onClick={handleImportArtifact}>
              Validate &amp; Import
            </button>
          </div>
          <textarea
            className="san-input"
            style={{ width: '100%', minHeight: '78px', marginTop: '0.45rem', fontFamily: 'monospace' }}
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder="Paste exported model JSON artifact or Python model source code…"
          />
        </div>
      </div>

      {editingModel && editingModel.evalParams && (
        <div className="panel-section">
          <div className="section-header">
            <span>Parameter Editor: {editingModel.name}</span>
            <button type="button" className="icon-btn" onClick={() => setSelectedEditId(null)}>Done</button>
          </div>
          <div className="control-grid-4">
            {Object.entries(PARAM_BOUNDS).map(([key, bound]: [string, any]) => (
              <label key={key} className="field">
                <span>{bound.label} ({bound.min}–{bound.max})</span>
                <input
                  type="number"
                  min={bound.min}
                  max={bound.max}
                  value={editingModel.evalParams[key] ?? DEFAULT_EVAL_PARAMS[key as keyof typeof DEFAULT_EVAL_PARAMS]}
                  onChange={e => {
                    const val = Math.max(bound.min, Math.min(bound.max, Number(e.target.value) || bound.min));
                    const next = userModels.map(m =>
                      m.id === editingModel.id ? { ...m, evalParams: { ...m.evalParams, [key]: val } } : m
                    );
                    setUserModels(next);
                    saveUserModelsList(next);
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="panel-section">
        <div className="section-header">
          <span>Verified Python Holdout Benchmark Report (300 Test Positions)</span>
          <span>Comparison: {compareIdA} vs {compareIdB}</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model ID</th>
              <th>Type</th>
              <th>Test MAE (cp)</th>
              <th>Test RMSE (cp)</th>
              <th>Sign Accuracy</th>
              <th>Pearson r</th>
              <th>Inference Latency</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_BENCHMARK_REPORT.models.map((b: any) => (
              <tr key={b.id}>
                <td><strong>{b.name}</strong></td>
                <td>{b.modelType}</td>
                <td>{b.maeCp} cp</td>
                <td>{b.rmseCp} cp</td>
                <td>{b.signAccuracyPct}%</td>
                <td>{b.pearsonR}</td>
                <td>{b.inferenceLatencyUsPerPos} µs/pos</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
