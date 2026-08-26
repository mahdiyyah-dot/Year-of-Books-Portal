import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import '../styles/dashboard.css';
import '../styles/leaderboard.css';

// Predefined set of background colors for initials-based student avatars
const AVATAR_COLORS = [
  '#713F98', // Purple
  '#29A2E1', // Cyan
  '#D01F82', // Pink
  '#4D3170', // Dark Purple
  '#FCB913', // Gold
  '#00B0FF', // Vivid Cyan
  '#EC407A'  // Vivid Pink
];

// Helper to get initials from a student name
const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase();
};

// Helper to assign a stable color to a student based on their name length
const getAvatarColor = (name) => {
  if (!name) return AVATAR_COLORS[0];
  const charCodeSum = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[charCodeSum % AVATAR_COLORS.length];
};

function CoordinatorDashboard({ user, profile, onProfileUpdate, onLogout }) {
  // Navigation tabs: 'points', 'status', 'reports', 'leaderboard'
  const [activeTab, setActiveTab] = useState('points');
  
  // Profile Setup State
  const [setupMode, setSetupMode] = useState(!profile?.coordinator_name || !profile?.coordinator_phone);
  const [coordName, setCoordName] = useState(profile?.coordinator_name || '');
  const [coordPhone, setCoordPhone] = useState(profile?.coordinator_phone || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Common active states
  const [activeMonth, setActiveMonth] = useState('2026-08');
  const [windowOpen, setWindowOpen] = useState(true);
  const [activeClass, setActiveClass] = useState('M1');

  // Manual Add Student States
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentReg, setNewStudentReg] = useState('');
  const [newStudentClass, setNewStudentClass] = useState('M1');
  const [addingStudent, setAddingStudent] = useState(false);

  // Manual Edit Student States
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [selectedStudentToEdit, setSelectedStudentToEdit] = useState(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentReg, setEditStudentReg] = useState('');
  const [editStudentClass, setEditStudentClass] = useState('M1');
  const [savingStudentEdit, setSavingStudentEdit] = useState(false);

  // Points State
  const [students, setStudents] = useState([]);
  const [pointsData, setPointsData] = useState({}); // studentId -> point string value
  const [originalPoints, setOriginalPoints] = useState({}); // studentId -> original point value
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);
  const [pointsSuccessMsg, setPointsSuccessMsg] = useState('');

  // Status Board State
  const [classStatus, setClassStatus] = useState({});
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Reports State
  const [programName, setProgramName] = useState('');
  const [programDate, setProgramDate] = useState('');
  const [programDesc, setProgramDesc] = useState('');
  const [programPhotos, setProgramPhotos] = useState([]); // files array
  const [photoPreviews, setPhotoPreviews] = useState([]); // dataURLs array
  const [submittingReport, setSubmittingReport] = useState(false);
  const [submittedReportsList, setSubmittedReportsList] = useState([]);
  const [reportSuccessMsg, setReportSuccessMsg] = useState('');

  // Local Leaderboards State
  const [leaderboardMode, setLeaderboardMode] = useState('monthly'); // 'monthly' or 'cumulative'
  const [localRankings, setLocalRankings] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Fetch Global Configuration and Active Window
  useEffect(() => {
    if (setupMode) return;
    
    const fetchConfig = async () => {
      try {
        // Active Month
        const { data: monthData } = await supabase
          .from('system_settings')
          .select('*')
          .eq('key', 'active_month')
          .single();
        if (monthData) {
          setActiveMonth(monthData.value.month);
        }

        // Check window permissions
        const { data: checkData, error } = await supabase
          .rpc('check_submission_allowed', { sc_code: profile.code });
        
        if (!error) {
          setWindowOpen(checkData);
        }
      } catch (err) {
        console.error('Error fetching window config:', err);
      }
    };

    fetchConfig();
  }, [setupMode, profile?.code]);

  // Fetch Students & Marks when activeClass or activeMonth or activeTab changes
  useEffect(() => {
    if (setupMode || activeTab !== 'points') return;
    fetchStudentsAndPoints();
  }, [activeClass, activeMonth, activeTab, setupMode]);

  // Fetch Status checklist when tab shifts to 'status'
  useEffect(() => {
    if (setupMode || activeTab !== 'status') return;
    fetchStatusBoard();
  }, [activeTab, activeMonth, setupMode]);

  // Fetch Submitted reports list and Local leaderboard when tab changes
  useEffect(() => {
    if (setupMode) return;
    if (activeTab === 'reports') {
      fetchSubmittedReports();
    } else if (activeTab === 'leaderboard') {
      fetchLocalLeaderboard();
    }
  }, [activeTab, activeMonth, leaderboardMode, setupMode]);

  // Handler: Profile Registration
  const handleProfileSetup = async (e) => {
    e.preventDefault();
    if (!coordName.trim() || !coordPhone.trim()) {
      alert('Please fill out both name and phone number.');
      return;
    }

    try {
      setSavingProfile(true);
      const { error } = await supabase
        .from('study_centres')
        .update({
          coordinator_name: coordName.trim(),
          coordinator_phone: coordPhone.trim()
        })
        .eq('id', user.id);

      if (error) throw error;
      
      onProfileUpdate({
        coordinator_name: coordName.trim(),
        coordinator_phone: coordPhone.trim()
      });
      setSetupMode(false);
    } catch (err) {
      alert('Failed to save profile: ' + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // Fetching roster and marks
  const fetchStudentsAndPoints = async () => {
    try {
      setLoadingStudents(true);
      setPointsSuccessMsg('');
      
      // Get students
      const { data: roster, error: rError } = await supabase
        .from('students')
        .select('*')
        .eq('study_centre_code', profile.code)
        .eq('class', activeClass)
        .order('name', { ascending: true });

      if (rError) throw rError;

      if (roster && roster.length > 0) {
        const studentIds = roster.map(s => s.id);
        
        // Get existing points
        const { data: scores, error: sError } = await supabase
          .from('points')
          .select('*')
          .in('student_id', studentIds)
          .eq('month', activeMonth);

        if (sError) throw sError;

        const scoreMap = {};
        scores?.forEach(sc => {
          scoreMap[sc.student_id] = parseFloat(sc.points).toString();
        });

        // Initialize state fields
        const initialPoints = {};
        roster.forEach(s => {
          initialPoints[s.id] = scoreMap[s.id] || '';
        });

        setStudents(roster);
        setPointsData(initialPoints);
        setOriginalPoints({ ...initialPoints });
      } else {
        setStudents([]);
        setPointsData({});
        setOriginalPoints({});
      }
    } catch (err) {
      console.error('Error fetching students data:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  // Helper for Stepper Controls
  const handleStep = (studentId, amount) => {
    if (!windowOpen) return;
    const currentVal = parseFloat(pointsData[studentId]) || 0;
    // Calculate new point value ensuring it has only 1 decimal place and is non-negative
    const newVal = Math.max(0, parseFloat((currentVal + amount).toFixed(1)));
    setPointsData(prev => ({
      ...prev,
      [studentId]: newVal.toString()
    }));
  };

  // Add manual student entry
  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentReg.trim()) {
      alert('Please fill in all fields.');
      return;
    }

    try {
      setAddingStudent(true);
      const { error } = await supabase
        .from('students')
        .insert({
          register_number: newStudentReg.trim(),
          name: newStudentName.trim(),
          class: newStudentClass,
          study_centre_code: profile.code
        });

      if (error) throw error;

      // Reset fields and close modal
      setNewStudentName('');
      setNewStudentReg('');
      setShowAddStudentModal(false);

      alert(`Student "${newStudentName.trim()}" added successfully to Class ${newStudentClass}!`);
      
      // If the added student's class matches current class view, refresh roster
      if (newStudentClass === activeClass) {
        fetchStudentsAndPoints();
      }
    } catch (err) {
      alert('Error registering student: ' + err.message);
    } finally {
      setAddingStudent(false);
    }
  };

  const handleOpenEditModal = (student) => {
    setSelectedStudentToEdit(student);
    setEditStudentName(student.name);
    setEditStudentReg(student.register_number);
    setEditStudentClass(student.class);
    setShowEditStudentModal(true);
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    if (!selectedStudentToEdit) return;
    if (!editStudentName.trim() || !editStudentReg.trim()) {
      alert('Please fill in all fields.');
      return;
    }

    try {
      setSavingStudentEdit(true);
      const { error } = await supabase
        .from('students')
        .update({
          name: editStudentName.trim(),
          register_number: editStudentReg.trim(),
          class: editStudentClass
        })
        .eq('id', selectedStudentToEdit.id);

      if (error) throw error;

      alert(`Student details updated successfully!`);
      setShowEditStudentModal(false);
      setSelectedStudentToEdit(null);
      
      // Refresh roster
      fetchStudentsAndPoints();
    } catch (err) {
      alert('Error updating student: ' + err.message);
    } finally {
      setSavingStudentEdit(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!selectedStudentToEdit) return;
    
    const confirmDelete = window.confirm(`WARNING: This will permanently delete student "${selectedStudentToEdit.name}" and all of their point records. This cannot be undone. Are you sure you want to delete?`);
    if (!confirmDelete) return;

    try {
      setSavingStudentEdit(true);
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', selectedStudentToEdit.id);

      if (error) throw error;

      alert(`Student deleted successfully.`);
      setShowEditStudentModal(false);
      setSelectedStudentToEdit(null);
      
      // Refresh roster
      fetchStudentsAndPoints();
    } catch (err) {
      alert('Error deleting student: ' + err.message);
    } finally {
      setSavingStudentEdit(false);
    }
  };

  // Helper for direct input modification
  const handleInputChange = (studentId, value) => {
    if (!windowOpen) return;
    // Allow digits and decimals only
    if (value === '' || /^[0-9]*\.?[0-9]?$/.test(value)) {
      setPointsData(prev => ({
        ...prev,
        [studentId]: value
      }));
    }
  };

  // Floating save action
  const handleSavePoints = async () => {
    if (!windowOpen) return;
    
    // Find modified values compared to original
    const modifiedRecords = [];
    const deleteIds = [];

    students.forEach(s => {
      const current = pointsData[s.id];
      const original = originalPoints[s.id];
      
      if (current !== original) {
        if (current === '') {
          // Point cleared, meaning delete record
          deleteIds.push(s.id);
        } else {
          modifiedRecords.push({
            student_id: s.id,
            month: activeMonth,
            points: parseFloat(current)
          });
        }
      }
    });

    if (modifiedRecords.length === 0 && deleteIds.length === 0) {
      setPointsSuccessMsg('No changes detected.');
      return;
    }

    try {
      setSavingPoints(true);
      setPointsSuccessMsg('');

      // 1. Save inserts/updates
      if (modifiedRecords.length > 0) {
        // Supabase upsert requires constraint matching unique index (student_id, month)
        const { error: upsertError } = await supabase
          .from('points')
          .upsert(modifiedRecords, { onConflict: 'student_id,month' });

        if (upsertError) throw upsertError;
      }

      // 2. Perform deletes if input cleared
      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('points')
          .delete()
          .in('student_id', deleteIds)
          .eq('month', activeMonth);

        if (deleteError) throw deleteError;
      }

      // Reset references
      setOriginalPoints({ ...pointsData });
      setPointsSuccessMsg('Points saved successfully!');
      setTimeout(() => setPointsSuccessMsg(''), 3000);
    } catch (err) {
      alert('Error updating points: ' + err.message);
    } finally {
      setSavingPoints(false);
    }
  };

  // Check upload progress status
  const fetchStatusBoard = async () => {
    try {
      setLoadingStatus(true);
      
      // 1. Get total students in each class
      const { data: roster, error: rErr } = await supabase
        .from('students')
        .select('id, class')
        .eq('study_centre_code', profile.code);

      if (rErr) throw rErr;

      const classTotals = { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };
      roster?.forEach(s => {
        if (classTotals[s.class] !== undefined) {
          classTotals[s.class]++;
        }
      });

      // 2. Get completed points uploads count
      const studentIds = roster?.map(s => s.id) || [];
      
      let uploadCounts = { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };
      if (studentIds.length > 0) {
        const { data: scoreRecords, error: sErr } = await supabase
          .from('points')
          .select('student_id, students(class)')
          .in('student_id', studentIds)
          .eq('month', activeMonth);

        if (sErr) throw sErr;

        scoreRecords?.forEach(rec => {
          const sClass = rec.students?.class;
          if (uploadCounts[sClass] !== undefined) {
            uploadCounts[sClass]++;
          }
        });
      }

      // 3. Compile status details
      const statusMap = {};
      ['M1', 'M2', 'M3', 'M4', 'M5'].forEach(cls => {
        const total = classTotals[cls] || 0;
        const uploaded = uploadCounts[cls] || 0;
        
        statusMap[cls] = {
          total,
          uploaded,
          status: total === 0 ? 'empty' : (uploaded === total ? 'completed' : (uploaded > 0 ? 'in_progress' : 'pending'))
        };
      });

      setClassStatus(statusMap);
    } catch (err) {
      console.error('Error generating status board:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  // Program Reports list fetch
  const fetchSubmittedReports = async () => {
    try {
      const { data, error } = await supabase
        .from('program_reports')
        .select(`
          *,
          program_photos(id, photo_url)
        `)
        .eq('study_centre_code', profile.code)
        .eq('month', activeMonth)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubmittedReportsList(data || []);
    } catch (err) {
      console.error('Error loading reports:', err);
    }
  };

  // Image Selection Preview handler
  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setProgramPhotos(prev => [...prev, ...files]);

    // Generate browser object preview URLs
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhotoPreview = (index) => {
    setProgramPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Submit report + upload images
  const handleReportSubmit = async (e) => {
    e.preventDefault();
    if (!windowOpen) {
      alert('Submissions are locked for this month.');
      return;
    }
    if (!programName.trim() || !programDate || !programDesc.trim()) {
      alert('Please fill out all fields.');
      return;
    }

    try {
      setSubmittingReport(true);
      setReportSuccessMsg('');

      // 1. Create program report record
      const { data: newReport, error: rError } = await supabase
        .from('program_reports')
        .insert({
          study_centre_code: profile.code,
          month: activeMonth,
          name: programName.trim(),
          date: programDate,
          description: programDesc.trim()
        })
        .select()
        .single();

      if (rError) throw rError;

      // 2. Upload images if chosen
      if (programPhotos.length > 0) {
        const photoUrls = [];

        for (const file of programPhotos) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${newReport.id}_${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `${profile.code}/${activeMonth}/${fileName}`;

          // Upload file to Supabase Storage Bucket 'program-photos'
          const { error: uploadError, data } = await supabase.storage
            .from('program-photos')
            .upload(filePath, file);

          if (uploadError) {
            // Storage bucket missing fallback: use base64 encoding to verify upload capability inline
            console.warn('Storage bucket upload failed, falling back to base64...', uploadError);
            const base64Data = await new Promise((resolve) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result);
              r.readAsDataURL(file);
            });
            photoUrls.push(base64Data);
          } else {
            // Get public URL
            const { data: { publicUrl } } = supabase.storage
              .from('program-photos')
              .getPublicUrl(filePath);
            photoUrls.push(publicUrl);
          }
        }

        // Insert photos into DB linked to report
        if (photoUrls.length > 0) {
          const photoRecords = photoUrls.map(url => ({
            report_id: newReport.id,
            photo_url: url
          }));

          const { error: pError } = await supabase
            .from('program_photos')
            .insert(photoRecords);

          if (pError) throw pError;
        }
      }

      setReportSuccessMsg('Report submitted successfully!');
      
      // Clear forms
      setProgramName('');
      setProgramDate('');
      setProgramDesc('');
      setProgramPhotos([]);
      setPhotoPreviews([]);
      
      // Reload reports
      fetchSubmittedReports();
      setTimeout(() => setReportSuccessMsg(''), 3000);
    } catch (err) {
      alert('Error submitting report: ' + err.message);
    } finally {
      setSubmittingReport(false);
    }
  };

  // Local college leaderboard calculation
  const fetchLocalLeaderboard = async () => {
    try {
      setLoadingLeaderboard(true);
      
      // Get all students
      const { data: roster, error: rErr } = await supabase
        .from('students')
        .select('id, name, class, register_number')
        .eq('study_centre_code', profile.code);

      if (rErr) throw rErr;

      if (!roster || roster.length === 0) {
        setLocalRankings([]);
        return;
      }

      const studentIds = roster.map(s => s.id);

      // Get points
      let query = supabase
        .from('points')
        .select('student_id, points');

      if (leaderboardMode === 'monthly') {
        query = query.eq('month', activeMonth);
      } // cumulative reads all months

      const { data: scores, error: sErr } = await query.in('student_id', studentIds);
      if (sErr) throw sErr;

      // Group & aggregate scores
      const scoreTotals = {};
      scores?.forEach(sc => {
        const pts = parseFloat(sc.points) || 0;
        scoreTotals[sc.student_id] = (scoreTotals[sc.student_id] || 0) + pts;
      });

      // Map back to students and sort
      const rankedList = roster.map(st => ({
        ...st,
        score: scoreTotals[st.id] ? parseFloat(scoreTotals[st.id].toFixed(1)) : 0
      }))
      .sort((a, b) => b.score - a.score);

      setLocalRankings(rankedList);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // Profile setup visual block
  if (setupMode) {
    return (
      <div className="login-root animate-fade">
        <div className="login-card">
          <div className="login-logo-section">
            <h1 className="login-brand-name">PROFILE SETUP</h1>
            <p className="login-brand-tagline">Please verify your coordinator details</p>
          </div>
          <form onSubmit={handleProfileSetup}>
            <div className="form-group">
              <label>Study Centre Code</label>
              <input type="text" value={profile?.code || ''} disabled style={{ backgroundColor: '#F0F0F0', color: '#666' }} />
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>Study Centre Name</label>
              <input type="text" value={profile?.name || ''} disabled style={{ backgroundColor: '#F0F0F0', color: '#666' }} />
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>Coordinator Full Name</label>
              <input
                type="text"
                placeholder="e.g. Muhammed Rafi"
                value={coordName}
                onChange={(e) => setCoordName(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>Coordinator Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. +91 9876543210"
                value={coordPhone}
                onChange={(e) => setCoordPhone(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '24px', height: '48px' }}
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving Details...' : 'Complete Registration'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Detect modified scores state to show floating save button
  const hasModifiedScores = students.some(s => pointsData[s.id] !== originalPoints[s.id]);

  return (
    <div className="dashboard-root animate-fade">
      {/* Dashboard Top Header Bar */}
      <header className="dashboard-header">
        <div className="brand-section">
          <svg viewBox="0 0 100 100" width="34" height="34">
            <path d="M22,75 L22,30 Q22,24 34,24 L34,75 Z" fill="#29A2E1" />
            <path d="M39,75 L39,46 Q39,40 51,40 L51,75 Z" fill="#713F98" />
            <path d="M56,75 L56,18 Q56,12 68,12 L68,75 Z" fill="#D01F82" />
            <polygon points="45,15 48,22 56,23 50,28 51,35 45,31 39,35 40,28 34,23 42,22" fill="#FCB913" />
          </svg>
          <div className="brand-title">
            MAHDIYYAH
            <span>{profile?.name} ({profile?.code})</span>
          </div>
        </div>
        <div className="user-profile-menu">
          <div className="avatar-circle">
            {getInitials(profile?.coordinator_name)}
          </div>
          <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '12px' }} onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container">
        {/* active window alert */}
        {!windowOpen && activeTab !== 'leaderboard' && (
          <div className="alert alert-warning animate-fade">
            <span className="alert-icon">🔒</span>
            <div>
              <strong>Submissions Closed!</strong> Point logging and report uploads are locked for {activeMonth}. Contact the Admin to request access.
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 1: POINTS INPUT */}
        {/* ==================================================== */}
        {activeTab === 'points' && (
          <div className="animate-fade">
            <div className="card">
              <h3 className="card-title">Log Reading Points</h3>
              <div className="card-desc">Enter the decimal points assigned to each student. Save when complete.</div>
              
              <div className="selector-row" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select value={activeClass} onChange={(e) => {
                  setActiveClass(e.target.value);
                  setNewStudentClass(e.target.value); // Sync default modal selection
                }} disabled={savingPoints}>
                  <option value="M1">Class M1</option>
                  <option value="M2">Class M2</option>
                  <option value="M3">Class M3</option>
                  <option value="M4">Class M4</option>
                  <option value="M5">Class M5</option>
                </select>

                <select value={activeMonth} onChange={(e) => setActiveMonth(e.target.value)} disabled={savingPoints}>
                  <option value="2026-08">August 2026</option>
                  <option value="2026-09">September 2026</option>
                  <option value="2026-10">October 2026</option>
                </select>

                <button 
                  className="btn btn-secondary animate-slide" 
                  onClick={() => {
                    setNewStudentClass(activeClass);
                    setShowAddStudentModal(true);
                  }}
                  disabled={!windowOpen || savingPoints}
                  style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', width: 'auto', marginLeft: 'auto' }}
                >
                  ➕ Add Student
                </button>
              </div>

              {pointsSuccessMsg && (
                <div className="alert alert-success animate-fade">
                  <span className="alert-icon">✓</span>
                  <div>{pointsSuccessMsg}</div>
                </div>
              )}

              {loadingStudents ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  Loading students roster...
                </div>
              ) : students.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  No students registered in Class {activeClass}.
                </div>
              ) : (
                <div className="student-entry-list">
                  {students.map(student => (
                    <div className="student-entry-row" key={student.id}>
                      <div className="student-info">
                        <div 
                          className="leaderboard-avatar" 
                          style={{ backgroundColor: getAvatarColor(student.name), width: '36px', height: '36px', fontSize: '13px' }}
                        >
                          {getInitials(student.name)}
                        </div>
                        <div className="student-name-box">
                          <span className="student-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {student.name}
                            {windowOpen && (
                              <button 
                                onClick={() => handleOpenEditModal(student)} 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '11px', lineHeight: '1', opacity: '0.6' }}
                                title="Edit Student Details"
                              >
                                ✏️
                              </button>
                            )}
                          </span>
                          <span className="student-reg">{student.register_number}</span>
                        </div>
                      </div>
                      
                      {/* Points stepper */}
                      <div className="stepper-input-container">
                        <button 
                          className="stepper-btn" 
                          onClick={() => handleStep(student.id, -0.1)}
                          disabled={!windowOpen || savingPoints}
                        >
                          -
                        </button>
                        <input
                          type="text"
                          className="stepper-value"
                          value={pointsData[student.id] || ''}
                          onChange={(e) => handleInputChange(student.id, e.target.value)}
                          placeholder="0.0"
                          disabled={!windowOpen || savingPoints}
                        />
                        <button 
                          className="stepper-btn" 
                          onClick={() => handleStep(student.id, 0.1)}
                          disabled={!windowOpen || savingPoints}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sticky Floating Save points button for mobile ease */}
            {hasModifiedScores && windowOpen && (
              <div className="floating-action-container">
                <button 
                  className="btn btn-primary floating-btn" 
                  onClick={handleSavePoints}
                  disabled={savingPoints}
                  style={{ padding: '14px 32px' }}
                >
                  {savingPoints ? 'Saving Scores...' : '💾 Save Class Points'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: UPLOAD STATUS BOARD */}
        {/* ==================================================== */}
        {activeTab === 'status' && (
          <div className="card animate-fade">
            <h3 className="card-title">Points Upload Status</h3>
            <div className="card-desc">Check the submission checklist for each class in your study centre.</div>
            
            <div className="selector-row">
              <select value={activeMonth} onChange={(e) => setActiveMonth(e.target.value)}>
                <option value="2026-08">August 2026</option>
                <option value="2026-09">September 2026</option>
                <option value="2026-10">October 2026</option>
              </select>
            </div>

            {loadingStatus ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                Loading status records...
              </div>
            ) : (
              <div className="status-grid">
                {Object.keys(classStatus).map(cls => {
                  const item = classStatus[cls];
                  return (
                    <div className="status-badge-card" key={cls}>
                      <div className="status-class-title">Class {cls}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                        {item.uploaded} / {item.total} Uploaded
                      </div>
                      {item.status === 'completed' && (
                        <span className="status-indicator done">Completed</span>
                      )}
                      {item.status === 'in_progress' && (
                        <span className="status-indicator pending">In Progress</span>
                      )}
                      {item.status === 'pending' && (
                        <span className="status-indicator pending" style={{ backgroundColor: '#FFEBEE', color: '#C62828' }}>
                          Not Uploaded
                        </span>
                      )}
                      {item.status === 'empty' && (
                        <span className="status-indicator" style={{ backgroundColor: '#F5F5F5', color: '#9E9E9E' }}>
                          No Rosters
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: REPORTS UPLOADER */}
        {/* ==================================================== */}
        {activeTab === 'reports' && (
          <div className="animate-fade">
            <div className="card">
              <h3 className="card-title">Submit Monthly Program Report</h3>
              <div className="card-desc">Log your reading activities. Multiple entries per month allowed.</div>
              
              {reportSuccessMsg && (
                <div className="alert alert-success animate-fade">
                  <span className="alert-icon">✓</span>
                  <div>{reportSuccessMsg}</div>
                </div>
              )}

              <form onSubmit={handleReportSubmit}>
                <div className="selector-row">
                  <select value={activeMonth} onChange={(e) => setActiveMonth(e.target.value)} disabled={submittingReport}>
                    <option value="2026-08">August 2026</option>
                    <option value="2026-09">September 2026</option>
                    <option value="2026-10">October 2026</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label htmlFor="program-name">Program Name</label>
                  <input
                    type="text"
                    id="program-name"
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    placeholder="e.g. Inauguration of Book Club"
                    required
                    disabled={!windowOpen || submittingReport}
                  />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label htmlFor="program-date">Program Date</label>
                  <input
                    type="date"
                    id="program-date"
                    value={programDate}
                    onChange={(e) => setProgramDate(e.target.value)}
                    required
                    disabled={!windowOpen || submittingReport}
                  />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label htmlFor="program-desc">Description</label>
                  <textarea
                    id="program-desc"
                    rows="3"
                    value={programDesc}
                    onChange={(e) => setProgramDesc(e.target.value)}
                    placeholder="Tell us about the attendees, activities, and response..."
                    required
                    disabled={!windowOpen || submittingReport}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Photo Selector */}
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label>Upload Program Photos</label>
                  <div 
                    className="drop-zone"
                    onClick={() => windowOpen && document.getElementById('photo-file-input').click()}
                  >
                    <span className="drop-zone-icon">📷</span>
                    <span className="drop-zone-text">Tap to capture or upload photos</span>
                    <span className="drop-zone-subtext">Supports PNG, JPG, JPEG</span>
                  </div>
                  <input
                    type="file"
                    id="photo-file-input"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    style={{ display: 'none' }}
                    disabled={!windowOpen || submittingReport}
                  />

                  {/* Previews panel */}
                  {photoPreviews.length > 0 && (
                    <div className="photo-upload-grid animate-fade">
                      {photoPreviews.map((preview, i) => (
                        <div className="photo-preview" key={i}>
                          <img src={preview} alt="preview" />
                          <button
                            type="button"
                            className="photo-delete-btn"
                            onClick={() => removePhotoPreview(i)}
                            disabled={submittingReport}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '24px', height: '46px' }}
                  disabled={!windowOpen || submittingReport}
                >
                  {submittingReport ? 'Uploading Report...' : '📤 Submit Program'}
                </button>
              </form>
            </div>

            {/* Submitted Reports Gallery */}
            <div className="card">
              <h3 className="card-title">Submitted in {activeMonth}</h3>
              {submittedReportsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No programs logged yet for this month.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {submittedReportsList.map(rep => (
                    <div key={rep.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h4 style={{ color: 'var(--dark-text)', fontSize: '14px', fontWeight: '700' }}>{rep.name}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{rep.date}</span>
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--text-main)', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                        {rep.description}
                      </p>
                      {/* Photos row */}
                      {rep.program_photos && rep.program_photos.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginTop: '8px', paddingBottom: '4px' }}>
                          {rep.program_photos.map(ph => (
                            <img 
                              key={ph.id} 
                              src={ph.photo_url} 
                              alt="Program" 
                              style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--border)' }} 
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: LEADERBOARD */}
        {/* ==================================================== */}
        {activeTab === 'leaderboard' && (
          <div className="animate-fade">
            <div className="card">
              <h3 className="card-title">Study Centre Leaderboard</h3>
              
              <div className="tab-filter-container">
                <button
                  className={`tab-filter-btn ${leaderboardMode === 'monthly' ? 'tab-filter-btn-active' : ''}`}
                  onClick={() => setLeaderboardMode('monthly')}
                >
                  Monthly Rankings
                </button>
                <button
                  className={`tab-filter-btn ${leaderboardMode === 'cumulative' ? 'tab-filter-btn-active' : ''}`}
                  onClick={() => setLeaderboardMode('cumulative')}
                >
                  Cumulative Rankings
                </button>
              </div>

              {leaderboardMode === 'monthly' && (
                <div className="selector-row">
                  <select value={activeMonth} onChange={(e) => setActiveMonth(e.target.value)}>
                    <option value="2026-08">August 2026</option>
                    <option value="2026-09">September 2026</option>
                    <option value="2026-10">October 2026</option>
                  </select>
                </div>
              )}

              {loadingLeaderboard ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  Calculating rankings...
                </div>
              ) : localRankings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  No point records found.
                </div>
              ) : (
                <div>
                  {/* Top 3 Podium Cards */}
                  {localRankings.length > 0 && (
                    <div className="podium-container animate-fade">
                      {/* 1st Place */}
                      {localRankings[0] && (
                        <div className="podium-column podium-first">
                          <div className="podium-avatar-wrapper">
                            <div className="podium-avatar" style={{ backgroundColor: getAvatarColor(localRankings[0].name) }}>
                              {getInitials(localRankings[0].name)}
                            </div>
                            <span className="podium-rank-badge">1</span>
                          </div>
                          <div className="podium-name">{localRankings[0].name}</div>
                          <div className="podium-subtext">Class {localRankings[0].class}</div>
                          <div className="podium-score">{localRankings[0].score} pts</div>
                        </div>
                      )}

                      {/* 2nd Place */}
                      {localRankings[1] && (
                        <div className="podium-column podium-second">
                          <div className="podium-avatar-wrapper">
                            <div className="podium-avatar" style={{ backgroundColor: getAvatarColor(localRankings[1].name) }}>
                              {getInitials(localRankings[1].name)}
                            </div>
                            <span className="podium-rank-badge">2</span>
                          </div>
                          <div className="podium-name">{localRankings[1].name}</div>
                          <div className="podium-subtext">Class {localRankings[1].class}</div>
                          <div className="podium-score">{localRankings[1].score} pts</div>
                        </div>
                      )}

                      {/* 3rd Place */}
                      {localRankings[2] && (
                        <div className="podium-column podium-third">
                          <div className="podium-avatar-wrapper">
                            <div className="podium-avatar" style={{ backgroundColor: getAvatarColor(localRankings[2].name) }}>
                              {getInitials(localRankings[2].name)}
                            </div>
                            <span className="podium-rank-badge">3</span>
                          </div>
                          <div className="podium-name">{localRankings[2].name}</div>
                          <div className="podium-subtext">Class {localRankings[2].class}</div>
                          <div className="podium-score">{localRankings[2].score} pts</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* List of remaining ranks */}
                  <div className="leaderboard-list">
                    {localRankings.slice(3).map((st, index) => (
                      <div className="leaderboard-row animate-fade" key={st.id}>
                        <div className="leaderboard-left">
                          <span className="leaderboard-rank">{index + 4}</span>
                          <div 
                            className="leaderboard-avatar" 
                            style={{ backgroundColor: getAvatarColor(st.name) }}
                          >
                            {getInitials(st.name)}
                          </div>
                          <div className="leaderboard-details">
                            <span className="leaderboard-name">{st.name}</span>
                            <span className="leaderboard-sub">Class {st.class} • Reg: {st.register_number}</span>
                          </div>
                        </div>
                        <div className="leaderboard-right">
                          <span className="leaderboard-score-pill">{st.score} pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Sticky Bottom Tab Bar for Mobile Navigation */}
      <nav className="mobile-nav-bar">
        <button 
          className={`nav-item ${activeTab === 'points' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('points')}
        >
          <span className="nav-icon">✍️</span>
          <span>Enter Points</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'status' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          <span className="nav-icon">📊</span>
          <span>Status Board</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'reports' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <span className="nav-icon">📤</span>
          <span>Upload Reports</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'leaderboard' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          <span className="nav-icon">🏆</span>
          <span>Leaderboard</span>
        </button>
      </nav>

      {/* Modal Overlay for Adding New Student */}
      {showAddStudentModal && (
        <div className="modal-backdrop animate-fade" onClick={() => setShowAddStudentModal(false)}>
          <div className="modal-card animate-slide" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '800', color: 'var(--primary)' }}>
              🎓 Add New Student
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Manually register a new admission student to your study centre.
            </p>
            
            <form onSubmit={handleAddStudent}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Register Number</label>
                <input 
                  type="text" 
                  placeholder="e.g. 2024-YOB-101" 
                  value={newStudentReg}
                  onChange={(e) => setNewStudentReg(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Student Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Amina Fathima" 
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Assigned Class</label>
                <select 
                  value={newStudentClass} 
                  onChange={(e) => setNewStudentClass(e.target.value)}
                  required
                >
                  <option value="M1">Class M1</option>
                  <option value="M2">Class M2</option>
                  <option value="M3">Class M3</option>
                  <option value="M4">Class M4</option>
                  <option value="M5">Class M5</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowAddStudentModal(false)}
                  style={{ padding: '10px 16px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ padding: '10px 20px', fontSize: '13px' }}
                  disabled={addingStudent}
                >
                  {addingStudent ? 'Registering...' : 'Register Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Overlay for Editing Student */}
      {showEditStudentModal && selectedStudentToEdit && (
        <div className="modal-backdrop animate-fade" onClick={() => {
          setShowEditStudentModal(false);
          setSelectedStudentToEdit(null);
        }}>
          <div className="modal-card animate-slide" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '800', color: 'var(--primary)' }}>
              ✏️ Edit Student Details
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Update details or remove this student registration from the portal.
            </p>
            
            <form onSubmit={handleUpdateStudent}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Register Number</label>
                <input 
                  type="text" 
                  value={editStudentReg}
                  onChange={(e) => setEditStudentReg(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Student Name</label>
                <input 
                  type="text" 
                  value={editStudentName}
                  onChange={(e) => setEditStudentName(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Assigned Class</label>
                <select 
                  value={editStudentClass} 
                  onChange={(e) => setEditStudentClass(e.target.value)}
                  required
                >
                  <option value="M1">Class M1</option>
                  <option value="M2">Class M2</option>
                  <option value="M3">Class M3</option>
                  <option value="M4">Class M4</option>
                  <option value="M5">Class M5</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                  type="button" 
                  className="btn btn-pink" 
                  onClick={handleDeleteStudent}
                  style={{ padding: '10px 16px', fontSize: '13px', backgroundColor: 'rgba(208, 31, 130, 0.1)', color: 'var(--accent-pink)' }}
                  disabled={savingStudentEdit}
                >
                  🗑️ Delete
                </button>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => {
                      setShowEditStudentModal(false);
                      setSelectedStudentToEdit(null);
                    }}
                    style={{ padding: '10px 16px', fontSize: '13px' }}
                    disabled={savingStudentEdit}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    style={{ padding: '10px 20px', fontSize: '13px' }}
                    disabled={savingStudentEdit}
                  >
                    {savingStudentEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CoordinatorDashboard;
