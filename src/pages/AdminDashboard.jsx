import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import '../styles/dashboard.css';
import '../styles/leaderboard.css';
import '../styles/print.css';

// Predefined colors for dynamic avatar initials
const AVATAR_COLORS = ['#713F98', '#29A2E1', '#D01F82', '#4D3170', '#FCB913', '#00B0FF', '#EC407A'];

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase();
};

const getAvatarColor = (name) => {
  if (!name) return AVATAR_COLORS[0];
  const charCodeSum = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[charCodeSum % AVATAR_COLORS.length];
};

// Generate UUID for study centre auth mapping
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

function AdminDashboard({ user, onLogout }) {
  // Navigation tabs: 'upload', 'override', 'status', 'leaderboard', 'reports'
  const [activeTab, setActiveTab] = useState('status');

  // Shared Month config state
  const [activeMonth, setActiveMonth] = useState('2026-08');
  const [globalMode, setGlobalMode] = useState('auto'); // 'auto', 'open', 'closed'

  // Lists from DB
  const [studyCentres, setStudyCentres] = useState([]);
  const [allStudentsCount, setAllStudentsCount] = useState(0);

  // File Importer states
  const [importType, setImportType] = useState('centres');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState({ text: '', type: '' });
  const [importStudentClass, setImportStudentClass] = useState('ALL'); // 'ALL', 'M1', 'M2', 'M3', 'M4', 'M5'

  // Status Matrix states
  const [matrixData, setMatrixData] = useState([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [availableMonths, setAvailableMonths] = useState(['2026-08', '2026-09', '2026-10']);
  const [matrixMonth, setMatrixMonth] = useState('2026-08');
  // Filters for Status Matrix
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterPointStatus, setFilterPointStatus] = useState('all'); // all, completed, in_progress, pending
  const [filterReportStatus, setFilterReportStatus] = useState('all'); // all, submitted, pending

  // State Level Leaderboards states
  const [leaderboardTab, setLeaderboardTab] = useState('centres'); // 'centres', 'students', 'classes'
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('monthly'); // 'monthly', 'cumulative'
  const [leaderboardClass, setLeaderboardClass] = useState('M1'); // 'M1', 'M2', 'M3', 'M4', 'M5'
  const [stateRankings, setStateRankings] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Reports Downloader states
  const [selectedReportCentre, setSelectedReportCentre] = useState('');
  const [availableReportMonths, setAvailableReportMonths] = useState([]);
  const [printingReport, setPrintingReport] = useState(null); // { centre, month, reports: [...] }
  const [loadingReports, setLoadingReports] = useState(false);

  // Initial Fetches
  useEffect(() => {
    fetchGlobalConfig();
    fetchStudyCentres();
  }, []);

  // Fetch Matrix board on tab or matrixMonth shift
  useEffect(() => {
    if (activeTab === 'status' && matrixMonth) {
      fetchStatusMatrix();
    }
  }, [activeTab, matrixMonth, studyCentres]);

  // Fetch State Leaderboard on tab/mode change
  useEffect(() => {
    if (activeTab === 'leaderboard') {
      fetchStateLeaderboards();
    }
  }, [activeTab, leaderboardTab, leaderboardPeriod, activeMonth, leaderboardClass]);

  // Fetch global config settings
  const fetchGlobalConfig = async () => {
    try {
      // Get Active Month
      const { data: monthData } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'active_month')
        .single();
      if (monthData) {
        setActiveMonth(monthData.value.month);
        setMatrixMonth(monthData.value.month); // Initialize local status board month
      }

      // Get Global Window state
      const { data: windowData } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'upload_window')
        .single();
      if (windowData) {
        setGlobalMode(windowData.value.mode);
      }

      // Get Available Months list
      const { data: monthsData } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'available_months')
        .maybeSingle();

      if (monthsData && Array.isArray(monthsData.value)) {
        setAvailableMonths(monthsData.value);
      } else {
        // Self-healing database seed if missing
        const defaultMonths = ['2026-08', '2026-09', '2026-10'];
        await supabase
          .from('system_settings')
          .upsert({ key: 'available_months', value: defaultMonths });
        setAvailableMonths(defaultMonths);
      }
    } catch (err) {
      console.error('Error loading configuration settings:', err);
    }
  };

  const formatMonthLabel = (monthStr) => {
    if (!monthStr || !monthStr.includes('-')) return monthStr;
    const [year, month] = monthStr.split('-');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = months[parseInt(month, 10) - 1] || month;
    return `${monthName} ${year}`;
  };

  // Fetch study centres list
  const fetchStudyCentres = async () => {
    try {
      const { data, error } = await supabase
        .from('study_centres')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setStudyCentres(data || []);

      // Get total students count
      const { count } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });
      setAllStudentsCount(count || 0);
    } catch (err) {
      console.error('Error fetching study centres roster:', err);
    }
  };

  // Handler: Update Global Month Setting
  const handleUpdateMonth = async (monthVal) => {
    try {
      setActiveMonth(monthVal);
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'active_month', value: { month: monthVal } });
      if (error) throw error;
    } catch (err) {
      alert('Error updating system active month: ' + err.message);
    }
  };

  // Handler: Update Global Window setting mode
  const handleUpdateGlobalMode = async (modeVal) => {
    try {
      setGlobalMode(modeVal);
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'upload_window', value: { mode: modeVal } });
      if (error) throw error;
    } catch (err) {
      alert('Error updating global upload window mode: ' + err.message);
    }
  };

  const handleAddMonth = async () => {
    const month = document.getElementById('new-month-select')?.value;
    const year = document.getElementById('new-year-select')?.value;
    if (!month || !year) return;

    const newMonthStr = `${year}-${month}`;
    if (availableMonths.includes(newMonthStr)) {
      alert('This month is already registered.');
      return;
    }

    const updated = [...availableMonths, newMonthStr].sort();
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'available_months', value: updated });

      if (error) throw error;
      setAvailableMonths(updated);
      alert(`Month "${formatMonthLabel(newMonthStr)}" added successfully!`);
    } catch (err) {
      alert('Failed to add month: ' + err.message);
    }
  };

  const handleRemoveMonth = async (monthStr) => {
    if (availableMonths.length <= 1) {
      alert('You must keep at least one active month.');
      return;
    }

    const confirmDel = window.confirm(`Are you sure you want to delete month "${formatMonthLabel(monthStr)}"? This will not delete points records, but will remove it from all dropdowns.`);
    if (!confirmDel) return;

    const updated = availableMonths.filter(m => m !== monthStr);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'available_months', value: updated });

      if (error) throw error;
      setAvailableMonths(updated);
      
      // If deleted month was the active month, set active month to the first available month
      if (activeMonth === monthStr) {
        handleUpdateMonth(updated[0]);
      }
      
      // If deleted month was the matrix month, reset it
      if (matrixMonth === monthStr) {
        setMatrixMonth(updated[0]);
      }
    } catch (err) {
      alert('Failed to remove month: ' + err.message);
    }
  };

  // Handler: Update individual study centre override
  const handleUpdateOverride = async (centreId, overrideVal) => {
    try {
      // overrideVal is either null, true, or false
      const { error } = await supabase
        .from('study_centres')
        .update({ is_active_override: overrideVal })
        .eq('id', centreId);

      if (error) throw error;

      // Update local state
      setStudyCentres(prev => prev.map(sc => 
        sc.id === centreId ? { ...sc, is_active_override: overrideVal } : sc
      ));
    } catch (err) {
      alert('Error updating study centre override status: ' + err.message);
    }
  };

  // Programmatic generation of sample CSV file templates for download
  const downloadSampleFile = (type) => {
    let content = "";
    let filename = "";
    if (type === 'centres') {
      content = "Study Centre Code,Study Centre Name,Place,District,Username,Password\n" +
                "YOB-001,Mahdiyyah Study Centre Calicut,Calicut,Kozhikode,centre_calicut,Calicut@123\n" +
                "YOB-002,Mahdiyyah Study Centre Malappuram,Malappuram,Malappuram,centre_malappuram,Malappuram@123\n" +
                "YOB-003,Mahdiyyah Study Centre Thrissur,Thrissur,Thrissur,centre_thrissur,Thrissur@123\n";
      filename = "sample_study_centres.csv";
    } else {
      content = "Register Number,Student Name,Class,Study Centre Code,Study Centre Name\n" +
                "2024-YOB-001,Fathima Rashida K,M1,YOB-001,Mahdiyyah Study Centre Calicut\n" +
                "2024-YOB-002,Aisha Siddiqua P,M2,YOB-001,Mahdiyyah Study Centre Calicut\n" +
                "2024-YOB-003,Mariyam Noor T,M3,YOB-001,Mahdiyyah Study Centre Calicut\n" +
                "2024-YOB-004,Zainab Firdous A,M4,YOB-001,Mahdiyyah Study Centre Calicut\n" +
                "2024-YOB-005,Hafsa Beevi M,M5,YOB-001,Mahdiyyah Study Centre Calicut\n";
      filename = "sample_students.csv";
    }
    
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handler: Delete/Wipe database tables for data cleanup
  const handleDeleteData = async () => {
    const deleteType = document.getElementById('delete-data-type')?.value;
    if (!deleteType) return;

    let confirmMsg = "";
    let actionType = "";
    let targetClass = "";

    if (deleteType === 'students_all') {
      confirmMsg = "This will permanently delete ALL students and all of their point records. Type 'WIPE' to confirm:";
      actionType = 'students_all';
    } else if (deleteType.startsWith('students_m')) {
      targetClass = deleteType.replace('students_', '').toUpperCase();
      confirmMsg = `This will permanently delete all students in Class ${targetClass} and their point records. Type 'WIPE' to confirm:`;
      actionType = 'students_class';
    } else if (deleteType === 'centres_all') {
      confirmMsg = "DANGER: This will permanently delete ALL study centres, ALL students, ALL points, and ALL program reports/photos. Type 'WIPE' to confirm:";
      actionType = 'centres_all';
    }

    const userInput = prompt(confirmMsg);
    if (userInput !== 'WIPE') {
      if (userInput !== null) {
        alert("Incorrect confirmation keyword. Deletion cancelled.");
      }
      return;
    }

    try {
      setImporting(true);
      setImportMsg({ text: 'Wiping selected database records...', type: 'warning' });

      if (actionType === 'students_all') {
        const { error } = await supabase
          .from('students')
          .delete()
          .filter('id', 'not.is', null);
        if (error) throw error;
        setImportMsg({ text: 'All student records and their points have been wiped successfully.', type: 'success' });
      } else if (actionType === 'students_class') {
        const { error } = await supabase
          .from('students')
          .delete()
          .eq('class', targetClass);
        if (error) throw error;
        setImportMsg({ text: `Class ${targetClass} student records and their points have been wiped successfully.`, type: 'success' });
      } else if (actionType === 'centres_all') {
        const { error } = await supabase
          .from('study_centres')
          .delete()
          .filter('id', 'not.is', null);
        if (error) throw error;
        setImportMsg({ text: 'All study centres and associated data (students, points, reports) have been wiped successfully.', type: 'success' });
      }

      // Refresh data stats
      fetchStudyCentres();
    } catch (err) {
      setImportMsg({ text: 'Wipe operation failed: ' + err.message, type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  // Excel Parser and Importer
  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    setImportMsg({ text: '', type: '' });

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        // Read and merge rows from ALL sheets in the workbook
        let rawRows = [];
        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const sheetRows = XLSX.utils.sheet_to_json(ws);
          if (Array.isArray(sheetRows)) {
            rawRows = rawRows.concat(sheetRows);
          }
        });

        if (rawRows.length === 0) {
          throw new Error('The uploaded Excel sheet contains no rows.');
        }

        // Normalize row keys to strip BOM (\uFEFF) and trim whitespace
        const rows = rawRows.map(row => {
          const cleanRow = {};
          for (const key of Object.keys(row)) {
            const cleanKey = key.replace(/^\uFEFF/, '').trim();
            cleanRow[cleanKey] = row[key];
          }
          return cleanRow;
        });

        if (importType === 'centres') {
          await processStudyCentres(rows);
        } else {
          await processStudents(rows);
        }
      } catch (err) {
        setImportMsg({ text: 'Import failed: ' + err.message, type: 'error' });
      } finally {
        setImporting(false);
        // Reset input element
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Process Excel rows: Study Centres
  const processStudyCentres = async (rows) => {
    let successCount = 0;
    let skippedCount = 0;
    const errorsList = [];

    for (const row of rows) {
      const code = row['Study Centre Code']?.toString().trim();
      const name = row['Study Centre Name']?.toString().trim();
      const place = row['Place']?.toString().trim();
      const district = row['District']?.toString().trim();
      const username = row['Username']?.toString().trim();
      const password = row['Password']?.toString().trim();

      if (!code || !name || !place || !district || !username || !password) {
        skippedCount++;
        const missingFields = [];
        if (!code) missingFields.push('Study Centre Code');
        if (!name) missingFields.push('Study Centre Name');
        if (!place) missingFields.push('Place');
        if (!district) missingFields.push('District');
        if (!username) missingFields.push('Username');
        if (!password) missingFields.push('Password');
        errorsList.push(`Row ${successCount + skippedCount}: Missing columns: ${missingFields.join(', ')}`);
        continue;
      }

      // Check if study centre exists by code or username
      const { data: existing } = await supabase
        .from('study_centres')
        .select('id')
        .or(`code.eq.${code},username.eq.${username}`)
        .maybeSingle();

      const userUuid = existing?.id || generateUUID();
      const email = `${username.toLowerCase()}@yob.portal`;

      let finalUuidVal = null;
      let rpcErrorVal = null;
      try {
        // Create or synchronize the login auth account and get the correct UUID
        const { data: finalUuid, error: rpcErr } = await supabase.rpc('create_auth_user', {
          p_id: userUuid,
          p_email: email,
          p_password: password,
          p_username: username
        });
        
        finalUuidVal = finalUuid;
        rpcErrorVal = rpcErr;
        
        if (rpcErr) throw rpcErr;

        // Insert / Update the public profile record using the correct UUID returned by the function
        const { error: upsertErr } = await supabase
          .from('study_centres')
          .upsert({
            id: finalUuid,
            code,
            name,
            place,
            district,
            username
          }, { onConflict: 'code' });

        if (upsertErr) throw upsertErr;
        successCount++;
      } catch (err) {
        console.error(`Error importing centre ${name}:`, err);
        errorsList.push(`Centre "${name || code}": ${err.message || JSON.stringify(err)} (UUID: ${finalUuidVal || 'null'}, rpcErr: ${rpcErrorVal ? (rpcErrorVal.message || JSON.stringify(rpcErrorVal)) : 'none'})`);
        skippedCount++;
      }
    }

    if (errorsList.length > 0) {
      setImportMsg({
        text: `Imported ${successCount} study centres. (Skipped/Failed: ${skippedCount}). Details: ${errorsList.slice(0, 3).join(' | ')}`,
        type: successCount > 0 ? 'warning' : 'error'
      });
    } else {
      setImportMsg({
        text: `Successfully imported all ${successCount} study centres.`,
        type: 'success'
      });
    }
    fetchStudyCentres();
  };

  // Process Excel rows: Students
  const processStudents = async (rows) => {
    const studentRecords = [];
    let skippedCount = 0;
    const errorsList = [];
    let tempCounter = 1;

    try {
      // Pre-validate that all Study Centre Codes in the spreadsheet actually exist in the database
      const { data: dbCentres, error: dbErr } = await supabase
        .from('study_centres')
        .select('code');
      
      if (dbErr) throw dbErr;

      const validCodes = new Set(dbCentres?.map(c => c.code.trim()) || []);
      const invalidCodes = new Set();

      // Gather any invalid codes first
      for (const row of rows) {
        const scCode = row['Study Centre Code']?.toString().trim();
        if (scCode && !validCodes.has(scCode)) {
          invalidCodes.add(scCode);
        }
      }

      if (invalidCodes.size > 0) {
        throw new Error(`The spreadsheet contains Study Centre Codes that are not registered in the database: ${Array.from(invalidCodes).join(', ')}. Please upload these study centres first or correct their codes in the Excel file.`);
      }
    } catch (validationErr) {
      setImportMsg({
        text: `Student import failed: ${validationErr.message}`,
        type: 'error'
      });
      return;
    }

    for (const row of rows) {
      let regNum = row['Register Number']?.toString().trim();
      const name = row['Student Name']?.toString().trim();
      let sClass = row['Class']?.toString().trim().toUpperCase(); // M1-M5
      const scCode = row['Study Centre Code']?.toString().trim();

      // Normalize missing or placeholder register numbers
      const isPlaceholder = !regNum || 
                            ['N/A', 'NILL', 'NA', 'NIL', 'NULL'].includes(regNum.toUpperCase());
      
      if (isPlaceholder) {
        // Generate a unique temporary register number
        regNum = `TEMP-${scCode || 'UNKNOWN'}-${Date.now().toString().slice(-6)}-${tempCounter++}`;
      }

      // If specific class filter is selected and class is missing in file, assign to it.
      if (!sClass && importStudentClass !== 'ALL') {
        sClass = importStudentClass;
      }

      if (!regNum || !name || !sClass || !scCode) {
        skippedCount++;
        const missingFields = [];
        if (!regNum) missingFields.push('Register Number');
        if (!name) missingFields.push('Student Name');
        if (!sClass) missingFields.push('Class');
        if (!scCode) missingFields.push('Study Centre Code');
        errorsList.push(`Row ${studentRecords.length + skippedCount}: Missing fields: ${missingFields.join(', ')}`);
        continue;
      }

      // Skip record if it doesn't match selected class override
      if (importStudentClass !== 'ALL' && sClass !== importStudentClass) {
        skippedCount++;
        continue;
      }

      // Enforce class constraint
      if (!['M1', 'M2', 'M3', 'M4', 'M5'].includes(sClass)) {
        skippedCount++;
        errorsList.push(`Student "${name}": Invalid class category "${sClass}" (Must be M1-M5)`);
        continue;
      }

      studentRecords.push({
        register_number: regNum,
        name,
        class: sClass,
        study_centre_code: scCode
      });
    }

    try {
      if (studentRecords.length > 0) {
        // De-duplicate array by register_number to avoid Postgres duplicate payload crash
        const uniqueRecordsMap = {};
        studentRecords.forEach(record => {
          uniqueRecordsMap[record.register_number] = record;
        });
        const uniqueStudentRecords = Object.values(uniqueRecordsMap);
        
        // Chunk upserts to prevent database payload limits (chunks of 200)
        const chunkSize = 200;
        for (let i = 0; i < uniqueStudentRecords.length; i += chunkSize) {
          const chunk = uniqueStudentRecords.slice(i, i + chunkSize);
          const { error } = await supabase
            .from('students')
            .upsert(chunk, { onConflict: 'register_number' });

          if (error) throw error;
        }
      }

      if (errorsList.length > 0) {
        setImportMsg({
          text: `Successfully imported ${studentRecords.length} students. (Skipped/Failed: ${skippedCount}). Details: ${errorsList.slice(0, 3).join(' | ')}`,
          type: studentRecords.length > 0 ? 'warning' : 'error'
        });
      } else {
        setImportMsg({
          text: `Successfully imported all ${studentRecords.length} students.`,
          type: 'success'
        });
      }
    } catch (err) {
      setImportMsg({
        text: `Student import failed: ${err.message}`,
        type: 'error'
      });
    }
  };

  // Generate Matrix data of upload progress
  const fetchStatusMatrix = async () => {
    if (studyCentres.length === 0) {
      setMatrixData([]);
      return;
    }
    try {
      setLoadingMatrix(true);

      // 1. Get all students roster
      const { data: roster, error: rErr } = await supabase
        .from('students')
        .select('id, class, study_centre_code');
      if (rErr) throw rErr;

      // Group students count by centre code and class
      const schoolClassCount = {}; // code -> { M1: 0, M2: 0, ... }
      const studentIdToCentre = {}; // id -> code
      const studentIdToClass = {};  // id -> class

      roster?.forEach(s => {
        studentIdToCentre[s.id] = s.study_centre_code;
        studentIdToClass[s.id] = s.class;

        if (!schoolClassCount[s.study_centre_code]) {
          schoolClassCount[s.study_centre_code] = { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };
        }
        if (schoolClassCount[s.study_centre_code][s.class] !== undefined) {
          schoolClassCount[s.study_centre_code][s.class]++;
        }
      });

      // 2. Get point records count for the active month
      const { data: scoreRecords, error: sErr } = await supabase
        .from('points')
        .select('student_id')
        .eq('month', matrixMonth);
      if (sErr) throw sErr;

      // Group points uploads by centre code and class
      const schoolUploadedCount = {}; // code -> { M1: 0, M2: 0, ... }
      scoreRecords?.forEach(rec => {
        const sCode = studentIdToCentre[rec.student_id];
        const sClass = studentIdToClass[rec.student_id];
        
        if (sCode && sClass) {
          if (!schoolUploadedCount[sCode]) {
            schoolUploadedCount[sCode] = { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };
          }
          if (schoolUploadedCount[sCode][sClass] !== undefined) {
            schoolUploadedCount[sCode][sClass]++;
          }
        }
      });

      // 3. Get monthly program reports submitted for active month
      const { data: reports, error: repErr } = await supabase
        .from('program_reports')
        .select('study_centre_code, id')
        .eq('month', matrixMonth);
      if (repErr) throw repErr;

      const reportSubmitted = {}; // code -> boolean
      reports?.forEach(rep => {
        reportSubmitted[rep.study_centre_code] = true;
      });

      // 4. Compile details for each study centre
      const compiled = studyCentres.map(centre => {
        const targetCount = schoolClassCount[centre.code] || { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };
        const fillCount = schoolUploadedCount[centre.code] || { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 };

        const classStatuses = {};
        let totalClassesWithStudents = 0;
        let completedClasses = 0;
        let inProgressClasses = 0;

        ['M1', 'M2', 'M3', 'M4', 'M5'].forEach(cls => {
          const total = targetCount[cls];
          const filled = fillCount[cls] || 0;

          if (total > 0) {
            totalClassesWithStudents++;
            if (filled === total) {
              classStatuses[cls] = 'completed';
              completedClasses++;
            } else if (filled > 0) {
              classStatuses[cls] = 'in_progress';
              inProgressClasses++;
            } else {
              classStatuses[cls] = 'pending';
            }
          } else {
            classStatuses[cls] = 'empty';
          }
        });

        // Determine general point progress state
        let pointState = 'pending';
        if (totalClassesWithStudents > 0) {
          if (completedClasses === totalClassesWithStudents) {
            pointState = 'completed';
          } else if (completedClasses > 0 || inProgressClasses > 0) {
            pointState = 'in_progress';
          }
        } else {
          pointState = 'empty';
        }

        const totalStudents = (targetCount.M1 || 0) + (targetCount.M2 || 0) + (targetCount.M3 || 0) + (targetCount.M4 || 0) + (targetCount.M5 || 0);

        return {
          ...centre,
          classes: classStatuses,
          pointState,
          totalStudents,
          reportState: reportSubmitted[centre.code] ? 'submitted' : 'pending'
        };
      });

      setMatrixData(compiled);
    } catch (err) {
      console.error('Error generating matrix status data:', err);
    } finally {
      setLoadingMatrix(false);
    }
  };

  // State-wide Leaderboards calculation
  const fetchStateLeaderboards = async () => {
    try {
      setLoadingLeaderboard(true);
      setStateRankings([]);

      // Fetch all students
      const { data: roster, error: rErr } = await supabase
        .from('students')
        .select('id, name, class, study_centre_code, register_number, study_centres(name)');
      if (rErr) throw rErr;

      const studentIds = roster?.map(s => s.id) || [];
      if (studentIds.length === 0) return;

      // Fetch points directly (fixes 414 URI Too Long error when roster is large)
      let scoreQuery = supabase
        .from('points')
        .select('student_id, points');

      if (leaderboardPeriod === 'monthly') {
        scoreQuery = scoreQuery.eq('month', activeMonth);
      }
      const { data: scores, error: sErr } = await scoreQuery;
      if (sErr) throw sErr;

      const scoreTotals = {};
      scores?.forEach(sc => {
        const pts = parseFloat(sc.points) || 0;
        scoreTotals[sc.student_id] = (scoreTotals[sc.student_id] || 0) + pts;
      });

      if (leaderboardTab === 'students') {
        // -------------------------
        // STUDENT LEADERBOARD
        // -------------------------
        const ranked = roster.map(st => ({
          id: st.id,
          name: st.name,
          class: st.class,
          reg: st.register_number,
          centreName: st.study_centres?.name || st.study_centre_code,
          score: scoreTotals[st.id] ? parseFloat(scoreTotals[st.id].toFixed(1)) : 0
        }))
        .sort((a, b) => b.score - a.score);

        setStateRankings(ranked);
      } else if (leaderboardTab === 'centres') {
        // -------------------------
        // STUDY CENTRE LEADERBOARD (Ranked by Average Points per Student)
        // -------------------------
        const schoolStudents = {}; // code -> student IDs list
        roster.forEach(st => {
          if (!schoolStudents[st.study_centre_code]) {
            schoolStudents[st.study_centre_code] = [];
          }
          schoolStudents[st.study_centre_code].push(st.id);
        });

        const schoolRankings = studyCentres.map(centre => {
          const sIds = schoolStudents[centre.code] || [];
          const studentCount = sIds.length;

          let sumScores = 0;
          sIds.forEach(id => {
            sumScores += scoreTotals[id] || 0;
          });

          const average = studentCount === 0 ? 0 : parseFloat((sumScores / studentCount).toFixed(2));

          return {
            id: centre.id,
            name: centre.name,
            code: centre.code,
            place: `${centre.place}, ${centre.district}`,
            studentCount,
            score: average, // uses 'score' key so it maps easily to podium render
            totalScore: parseFloat(sumScores.toFixed(1))
          };
        })
        .sort((a, b) => b.score - a.score);

        setStateRankings(schoolRankings);
      } else if (leaderboardTab === 'classes') {
        // -------------------------
        // STATE LEVEL STUDENTS RANKING FILTERED BY CLASS
        // -------------------------
        const classRoster = roster.filter(st => st.class === leaderboardClass);
        
        const ranked = classRoster.map(st => ({
          id: st.id,
          name: st.name,
          class: st.class,
          reg: st.register_number,
          centreName: st.study_centres?.name || st.study_centre_code,
          score: scoreTotals[st.id] ? parseFloat(scoreTotals[st.id].toFixed(1)) : 0
        }))
        .sort((a, b) => b.score - a.score);

        setStateRankings(ranked);
      }
    } catch (err) {
      console.error('Error generating state rankings:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // Report Downloader: selection of study centre load months
  const handleSelectReportCentre = async (centreCode) => {
    setSelectedReportCentre(centreCode);
    setAvailableReportMonths([]);
    setPrintingReport(null);

    if (!centreCode) return;

    try {
      setLoadingReports(true);
      // Query unique months from program_reports uploaded by this centre
      const { data, error } = await supabase
        .from('program_reports')
        .select('month')
        .eq('study_centre_code', centreCode);

      if (error) throw error;
      
      // Extract unique months
      const uniqueMonths = Array.from(new Set(data?.map(d => d.month) || [])).sort().reverse();
      setAvailableReportMonths(uniqueMonths);
    } catch (err) {
      alert('Error fetching reports directory: ' + err.message);
    } finally {
      setLoadingReports(false);
    }
  };

  // Compile print package for selected school + month
  const handleLoadPrintReport = async (monthVal) => {
    try {
      setLoadingReports(true);
      const centreData = studyCentres.find(sc => sc.code === selectedReportCentre);

      // Get program reports + photos
      const { data: reports, error: rErr } = await supabase
        .from('program_reports')
        .select(`
          *,
          program_photos(id, photo_url)
        `)
        .eq('study_centre_code', selectedReportCentre)
        .eq('month', monthVal)
        .order('date', { ascending: true });

      if (rErr) throw rErr;

      setPrintingReport({
        centre: centreData,
        month: monthVal,
        reports: reports || []
      });
    } catch (err) {
      alert('Error rendering printing module: ' + err.message);
    } finally {
      setLoadingReports(false);
    }
  };

  // Trigger Browser System Print
  const handleTriggerPrint = () => {
    window.print();
  };

  // Status Matrix Filter helper
  const filteredMatrix = matrixData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(filterSearch.toLowerCase()) || 
                          item.code.toLowerCase().includes(filterSearch.toLowerCase());
    
    const matchesDistrict = filterDistrict === '' || item.district === filterDistrict;
    
    const matchesPoint = filterPointStatus === 'all' || item.pointState === filterPointStatus;
    
    const matchesReport = filterReportStatus === 'all' || item.reportState === filterReportStatus;

    return matchesSearch && matchesDistrict && matchesPoint && matchesReport;
  });

  // Extract list of districts for filters dropdown
  const uniqueDistricts = Array.from(new Set(studyCentres.map(sc => sc.district))).sort();

  // If currently printing a report, display ONLY the printing wrapper to prevent UI bleeding
  if (printingReport) {
    return (
      <div className="animate-fade" style={{ minHeight: '100vh', backgroundColor: '#FFFFFF' }}>
        {/* Printable View Screen Navigation header (Hidden in system print output) */}
        <div className="no-print" style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Report Preview Mode:</strong> {printingReport.centre.name} • {printingReport.month}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-pink" onClick={handleTriggerPrint} style={{ padding: '8px 16px', fontSize: '13px' }}>
              🖨️ Print & Save PDF (A4)
            </button>
            <button className="btn btn-secondary" onClick={() => setPrintingReport(null)} style={{ padding: '8px 16px', fontSize: '13px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}>
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Print Layout Card */}
        <div className="print-page-preview animate-slide">
          <div className="print-report-header">
            <h1 className="print-report-title">MONTHLY ACTIVITY REPORT</h1>
            <div className="print-report-meta">
              <span><strong>Study Centre:</strong> {printingReport.centre.name} ({printingReport.centre.code})</span>
              <span><strong>Location:</strong> {printingReport.centre.place}, {printingReport.centre.district}</span>
              <span><strong>Reporting Month:</strong> {printingReport.month}</span>
            </div>
            <div className="print-report-meta" style={{ marginTop: '4px' }}>
              <span><strong>Coordinator:</strong> {printingReport.centre.coordinator_name || 'Not Registered'}</span>
              <span><strong>Phone:</strong> {printingReport.centre.coordinator_phone || 'N/A'}</span>
            </div>
          </div>

          {printingReport.reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: '#666' }}>
              No program reports uploaded for this month.
            </div>
          ) : (
            <div>
              {printingReport.reports.map((rep, idx) => (
                <div className="print-program-card" key={rep.id}>
                  <h2 className="print-program-title">{idx + 1}. {rep.name}</h2>
                  <div className="print-program-meta">Conducted Date: {rep.date}</div>
                  <p className="print-program-desc">{rep.description}</p>
                  
                  {/* Photo attachments */}
                  {rep.program_photos && rep.program_photos.length > 0 && (
                    <div className="print-photos-grid">
                      {rep.program_photos.map(ph => (
                        <div className="print-photo-wrapper" key={ph.id}>
                          <img src={ph.photo_url} alt="Activity attachment" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-root animate-fade">
      {/* Dashboard Top Header */}
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
            <span>Year of Books • Admin Console <small style={{background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontSize: '10px', fontWeight: 'bold'}}>v1.3 (Idempotent Import)</small></span>
          </div>
        </div>
        <div className="user-profile-menu">
          <div className="avatar-circle" style={{ background: 'linear-gradient(135deg, var(--accent-pink), var(--primary))' }}>
            AD
          </div>
          <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '12px' }} onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="container" style={{ maxWidth: '1200px' }}>
        {/* State Summary Stats */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div className="card" style={{ flex: 1, minWidth: '150px', marginBottom: 0, padding: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Registered Study Centres</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>{studyCentres.length}</div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: '150px', marginBottom: 0, padding: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Enrolled Students</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--secondary)' }}>{allStudentsCount}</div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: '150px', marginBottom: 0, padding: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Active Window Settings</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--accent-pink)', marginTop: '8px' }}>
              Month: {activeMonth} ({globalMode.toUpperCase()})
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* TAB 1: UPLOAD EXCEL DATA */}
        {/* ==================================================== */}
        {activeTab === 'upload' && (
          <>
            <div className="card animate-fade">
              <h3 className="card-title">Bulk Excel Importer</h3>
              <div className="card-desc">Populate study centres and student registers via Excel spreadsheets.</div>
              
              <div className="tab-filter-container" style={{ marginBottom: '20px' }}>
                <button
                  className={`tab-filter-btn ${importType === 'centres' ? 'tab-filter-btn-active' : ''}`}
                  onClick={() => setImportType('centres')}
                >
                  Import Study Centres
                </button>
                <button
                  className={`tab-filter-btn ${importType === 'students' ? 'tab-filter-btn-active' : ''}`}
                  onClick={() => setImportType('students')}
                >
                  Import Student Register
                </button>
              </div>

              {/* Sample Templates Download Suite */}
              <div style={{ margin: '0 0 20px 0', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>📂 DOWNLOAD SAMPLE EXCEL TEMPLATES:</span>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button 
                    className="btn btn-secondary animate-slide" 
                    onClick={() => downloadSampleFile('centres')}
                    style={{ padding: '8px 14px', fontSize: '11px', flex: 1, minWidth: '150px' }}
                  >
                    📥 Study Centres Template (.csv)
                  </button>
                  <button 
                    className="btn btn-secondary animate-slide" 
                    onClick={() => downloadSampleFile('students')}
                    style={{ padding: '8px 14px', fontSize: '11px', flex: 1, minWidth: '150px' }}
                  >
                    📥 Students Template (.csv)
                  </button>
                </div>
              </div>

              {/* Target Class Selector for Students Upload */}
              {importType === 'students' && (
                <div style={{ marginBottom: '20px', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--bg-main)' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-main)' }}>
                    🎯 Target Class Filter / Override:
                  </label>
                  <select 
                    value={importStudentClass} 
                    onChange={(e) => setImportStudentClass(e.target.value)}
                    style={{ width: '100%', maxWidth: '350px', padding: '8px 12px', fontSize: '13px', borderRadius: '6px' }}
                  >
                    <option value="ALL">All Classes (Auto-detect class from file column)</option>
                    <option value="M1">Class M1 Only (Filter rows or assign M1 if column missing)</option>
                    <option value="M2">Class M2 Only (Filter rows or assign M2 if column missing)</option>
                    <option value="M3">Class M3 Only (Filter rows or assign M3 if column missing)</option>
                    <option value="M4">Class M4 Only (Filter rows or assign M4 if column missing)</option>
                    <option value="M5">Class M5 Only (Filter rows or assign M5 if column missing)</option>
                  </select>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    * Selecting a class (e.g., M1) allows you to upload an Excel file without a "Class" column, or filters a mixed file to import only M1.
                  </div>
                </div>
              )}

              {importMsg.text && (
                <div className={`alert ${importMsg.type === 'success' ? 'alert-success' : 'alert-warning'} animate-fade`}>
                  <span className="alert-icon">{importMsg.type === 'success' ? '✓' : '⚠️'}</span>
                  <div>{importMsg.text}</div>
                </div>
              )}

              <div 
                className="drop-zone"
                onClick={() => !importing && document.getElementById('excel-file-input').click()}
                style={{ padding: '45px 20px' }}
              >
                <span className="drop-zone-icon" style={{ fontSize: '44px' }}>📁</span>
                <span className="drop-zone-text">
                  {importing ? 'Processing file records...' : `Tap to choose Excel sheet for ${importType === 'centres' ? 'Study Centres' : `Students (${importStudentClass === 'ALL' ? 'All Classes' : `Class ${importStudentClass}`})`}`}
                </span>
                <span className="drop-zone-subtext">Supports .xlsx, .xls, .csv templates</span>
              </div>
              
              <input
                type="file"
                id="excel-file-input"
                accept=".xlsx, .xls, .csv"
                onChange={handleExcelImport}
                style={{ display: 'none' }}
                disabled={importing}
              />

              {/* Template specs notes */}
              <div style={{ marginTop: '20px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                <strong>Expected Header Formats:</strong>
                {importType === 'centres' ? (
                  <ul>
                    <li>Study Centre Code • Study Centre Name • Place • District • Username • Password</li>
                  </ul>
                ) : (
                  <ul>
                    <li>Register Number • Student Name • Class {importStudentClass === 'ALL' ? '(M1, M2, M3, M4, M5)' : `(Optional, defaulted to ${importStudentClass})`} • Study Centre Code • Study Centre Name</li>
                  </ul>
                )}
              </div>
            </div>

            {/* DANGER ZONE: DATA MANAGEMENT & WIPE */}
            <div className="card animate-fade" style={{ borderLeft: '5px solid var(--accent-pink)', marginTop: '20px' }}>
              <h3 className="card-title" style={{ color: 'var(--accent-pink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span> Database Cleanup & Wipe Options
              </h3>
              <div className="card-desc">Permanently remove records to fix upload errors or prepare for fresh registrations. All deletions cascade-delete related points automatically.</div>
              
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '16px' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px', color: 'var(--text-main)' }}>
                    Choose Table Category to Wipe:
                  </label>
                  <select 
                    id="delete-data-type"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="students_all">Wipe ALL Student Roster (Clear Students & Points)</option>
                    <option value="students_m1">Wipe Class M1 Students Only</option>
                    <option value="students_m2">Wipe Class M2 Students Only</option>
                    <option value="students_m3">Wipe Class M3 Students Only</option>
                    <option value="students_m4">Wipe Class M4 Students Only</option>
                    <option value="students_m5">Wipe Class M5 Students Only</option>
                    <option value="centres_all">Wipe ALL Study Centres (WARNING: Wipes centres, coordinators, students, points, reports & photos!)</option>
                  </select>
                </div>
                
                <button 
                  className="btn btn-pink animate-slide"
                  onClick={handleDeleteData}
                  style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '700', height: '42px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  Wipe Selected Records
                </button>
              </div>
            </div>
          </>
        )}

        {/* ==================================================== */}
        {/* TAB 2: SUBMISSION WINDOWS & DEADLINE OVERRIDES */}
        {/* ==================================================== */}
        {activeTab === 'override' && (
          <div className="animate-fade">
            {/* Global Settings controls */}
            <div className="card">
              <h3 className="card-title">Global Settings</h3>
              
              <div className="grid-2">
                <div>
                  <label>System Active Month</label>
                  <select value={activeMonth} onChange={(e) => handleUpdateMonth(e.target.value)}>
                    {availableMonths.map(m => (
                      <option key={m} value={m}>{formatMonthLabel(m)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Global Upload Window State</label>
                  <select value={globalMode} onChange={(e) => handleUpdateGlobalMode(e.target.value)}>
                    <option value="auto">Auto Window (1st - 5th each month)</option>
                    <option value="open">Force Open (Unlock all colleges)</option>
                    <option value="closed">Force Closed (Lock all colleges)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Individual school list overrides */}
            <div className="card">
              <h3 className="card-title">Study Centre Overrides</h3>
              <div className="card-desc">Manually lock or unlock point submission gates for specific colleges.</div>
              
              <div className="matrix-container">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Study Centre Name</th>
                      <th>District</th>
                      <th>Portal Access Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studyCentres.map(sc => (
                      <tr key={sc.id}>
                        <td><strong>{sc.code}</strong></td>
                        <td>{sc.name}</td>
                        <td>{sc.district}</td>
                        <td>
                          <select 
                            value={sc.is_active_override === null ? 'null' : sc.is_active_override.toString()}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleUpdateOverride(sc.id, val === 'null' ? null : (val === 'true'));
                            }}
                            style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }}
                          >
                            <option value="null">Default (Follows Global)</option>
                            <option value="true">Force Unlock (Open)</option>
                            <option value="false">Force Lock (Closed)</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Academic Months Manager */}
            <div className="card">
              <h3 className="card-title">Academic Months Manager</h3>
              <div className="card-desc">Add new academic months or delete unused months. All dropdown selectors sync automatically.</div>
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {availableMonths.map(m => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '13px' }}>
                    <strong>{formatMonthLabel(m)}</strong> ({m})
                    <button 
                      type="button" 
                      onClick={() => handleRemoveMonth(m)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-pink)', padding: '2px', fontWeight: 'bold' }}
                      title="Delete Month"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Month</label>
                  <select id="new-month-select" defaultValue="08" style={{ width: '130px', padding: '8px', borderRadius: '6px' }}>
                    <option value="01">January</option>
                    <option value="02">February</option>
                    <option value="03">March</option>
                    <option value="04">April</option>
                    <option value="05">May</option>
                    <option value="06">June</option>
                    <option value="07">July</option>
                    <option value="08">August</option>
                    <option value="09">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Year</label>
                  <select id="new-year-select" defaultValue="2026" style={{ width: '100px', padding: '8px', borderRadius: '6px' }}>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                    <option value="2028">2028</option>
                    <option value="2029">2029</option>
                  </select>
                </div>
                <button 
                  type="button" 
                  className="btn btn-primary animate-slide" 
                  onClick={handleAddMonth}
                  style={{ padding: '9px 16px', fontSize: '13px', height: '38px' }}
                >
                  ➕ Add Month
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: UPLOAD MONITOR (STATUS GRID) */}
        {/* ==================================================== */}
        {activeTab === 'status' && (
          <div className="card animate-fade">
            <h3 className="card-title">Upload Progress Monitor</h3>
            <div className="card-desc">Comprehensive checklist tracking points entry and program report submissions.</div>
            
            {/* Status Filter Matrix Controls */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <select
                value={matrixMonth}
                onChange={(e) => setMatrixMonth(e.target.value)}
                style={{ flex: 1, minWidth: '150px', padding: '10px 14px' }}
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Search code or school name..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                style={{ flex: 2, minWidth: '200px', padding: '10px 14px' }}
              />

              <select 
                value={filterDistrict} 
                onChange={(e) => setFilterDistrict(e.target.value)}
                style={{ flex: 1, minWidth: '130px', padding: '10px 14px' }}
              >
                <option value="">All Districts</option>
                {uniqueDistricts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              <select 
                value={filterPointStatus} 
                onChange={(e) => setFilterPointStatus(e.target.value)}
                style={{ flex: 1, minWidth: '130px', padding: '10px 14px' }}
              >
                <option value="all">All Point Upload States</option>
                <option value="completed">Completed (5 Classes)</option>
                <option value="in_progress">In Progress</option>
                <option value="pending">Not Uploaded</option>
              </select>

              <select 
                value={filterReportStatus} 
                onChange={(e) => setFilterReportStatus(e.target.value)}
                style={{ flex: 1, minWidth: '130px', padding: '10px 14px' }}
              >
                <option value="all">All Report Upload States</option>
                <option value="submitted">Report Uploaded</option>
                <option value="pending">Pending Reports</option>
              </select>
            </div>

            {loadingMatrix ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                Parsing upload databases...
              </div>
            ) : filteredMatrix.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                No study centres match filters.
              </div>
            ) : (
              <div className="matrix-container">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Study Centre Name</th>
                      <th style={{ textAlign: 'center' }}>Students</th>
                      <th style={{ textAlign: 'center' }}>M1</th>
                      <th style={{ textAlign: 'center' }}>M2</th>
                      <th style={{ textAlign: 'center' }}>M3</th>
                      <th style={{ textAlign: 'center' }}>M4</th>
                      <th style={{ textAlign: 'center' }}>M5</th>
                      <th>Reports Upload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatrix.map(item => (
                      <tr key={item.id}>
                        <td><strong>{item.code}</strong></td>
                        <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</td>
                        <td style={{ textAlign: 'center' }}><strong>{item.totalStudents || 0}</strong></td>
                        {['M1', 'M2', 'M3', 'M4', 'M5'].map(cls => {
                          const status = item.classes[cls];
                          return (
                            <td key={cls} style={{ textAlign: 'center' }}>
                              {status === 'completed' && <span style={{ color: '#2E7D32', fontWeight: 'bold' }}>✓</span>}
                              {status === 'in_progress' && <span style={{ color: '#EF6C00', fontWeight: 'bold' }}>◷</span>}
                              {status === 'pending' && <span style={{ color: '#C62828', fontWeight: 'bold' }}>✗</span>}
                              {status === 'empty' && <span style={{ color: '#9E9E9E' }}>—</span>}
                            </td>
                          );
                        })}
                        <td>
                          {item.reportState === 'submitted' ? (
                            <span className="badge badge-cyan" style={{ fontSize: '10px' }}>Submitted</span>
                          ) : (
                            <span className="badge" style={{ backgroundColor: '#FFEBEE', color: '#C62828', fontSize: '10px' }}>Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: LEADERBOARDS (STATE LEVEL) */}
        {/* ==================================================== */}
        {activeTab === 'leaderboard' && (
          <div className="card animate-fade">
            <h3 className="card-title">State Level Leaderboard Portal</h3>
            
            {/* Subtabs filter */}
            <div className="tab-filter-container">
              <button
                className={`tab-filter-btn ${leaderboardTab === 'centres' ? 'tab-filter-btn-active' : ''}`}
                onClick={() => setLeaderboardTab('centres')}
              >
                Colleges (Average)
              </button>
              <button
                className={`tab-filter-btn ${leaderboardTab === 'students' ? 'tab-filter-btn-active' : ''}`}
                onClick={() => setLeaderboardTab('students')}
              >
                All Students (Individual)
              </button>
              <button
                className={`tab-filter-btn ${leaderboardTab === 'classes' ? 'tab-filter-btn-active' : ''}`}
                onClick={() => setLeaderboardTab('classes')}
              >
                Class Ranks (State)
              </button>
            </div>

            {/* Mode selection row */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <select 
                value={leaderboardPeriod} 
                onChange={(e) => setLeaderboardPeriod(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="monthly">Monthly Rankings</option>
                <option value="cumulative">Cumulative Rankings</option>
              </select>

              {leaderboardTab === 'classes' && (
                <select 
                  value={leaderboardClass} 
                  onChange={(e) => setLeaderboardClass(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="M1">Class M1 State Ranks</option>
                  <option value="M2">Class M2 State Ranks</option>
                  <option value="M3">Class M3 State Ranks</option>
                  <option value="M4">Class M4 State Ranks</option>
                  <option value="M5">Class M5 State Ranks</option>
                </select>
              )}

              {leaderboardPeriod === 'monthly' && (
                <select 
                  value={activeMonth} 
                  onChange={(e) => setActiveMonth(e.target.value)}
                  style={{ flex: 1 }}
                >
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                  ))}
                </select>
              )}
            </div>

            {loadingLeaderboard ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                Aggregating state-wide databases...
              </div>
            ) : stateRankings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                No points data registered for this query.
              </div>
            ) : (
              <div>
                {/* Visual top-3 Podium */}
                <div className="podium-container animate-fade">
                  {/* 1st Place */}
                  {stateRankings[0] && (
                    <div className="podium-column podium-first">
                      <div className="podium-avatar-wrapper">
                        <div className="podium-avatar" style={{ backgroundColor: getAvatarColor(stateRankings[0].name) }}>
                          {getInitials(stateRankings[0].name)}
                        </div>
                        <span className="podium-rank-badge">1</span>
                      </div>
                      <div className="podium-name">{stateRankings[0].name}</div>
                      <div className="podium-subtext">{stateRankings[0].place || stateRankings[0].centreName}</div>
                      <div className="podium-score">
                        {leaderboardTab === 'centres'
                          ? `Avg: ${stateRankings[0].score} | Total: ${stateRankings[0].totalScore || 0}`
                          : `${stateRankings[0].score} pts`
                        }
                      </div>
                    </div>
                  )}

                  {/* 2nd Place */}
                  {stateRankings[1] && (
                    <div className="podium-column podium-second">
                      <div className="podium-avatar-wrapper">
                        <div className="podium-avatar" style={{ backgroundColor: getAvatarColor(stateRankings[1].name) }}>
                          {getInitials(stateRankings[1].name)}
                        </div>
                        <span className="podium-rank-badge">2</span>
                      </div>
                      <div className="podium-name">{stateRankings[1].name}</div>
                      <div className="podium-subtext">{stateRankings[1].place || stateRankings[1].centreName}</div>
                      <div className="podium-score">
                        {leaderboardTab === 'centres'
                          ? `Avg: ${stateRankings[1].score} | Total: ${stateRankings[1].totalScore || 0}`
                          : `${stateRankings[1].score} pts`
                        }
                      </div>
                    </div>
                  )}

                  {/* 3rd Place */}
                  {stateRankings[2] && (
                    <div className="podium-column podium-third">
                      <div className="podium-avatar-wrapper">
                        <div className="podium-avatar" style={{ backgroundColor: getAvatarColor(stateRankings[2].name) }}>
                          {getInitials(stateRankings[2].name)}
                        </div>
                        <span className="podium-rank-badge">3</span>
                      </div>
                      <div className="podium-name">{stateRankings[2].name}</div>
                      <div className="podium-subtext">{stateRankings[2].place || stateRankings[2].centreName}</div>
                      <div className="podium-score">
                        {leaderboardTab === 'centres'
                          ? `Avg: ${stateRankings[2].score} | Total: ${stateRankings[2].totalScore || 0}`
                          : `${stateRankings[2].score} pts`
                        }
                      </div>
                    </div>
                  )}
                </div>

                {/* Remaining rankings List */}
                <div className="leaderboard-list">
                  {stateRankings.slice(3).map((item, idx) => (
                    <div className="leaderboard-row animate-fade" key={item.id}>
                      <div className="leaderboard-left">
                        <span className="leaderboard-rank">{idx + 4}</span>
                        <div className="leaderboard-avatar" style={{ backgroundColor: getAvatarColor(item.name) }}>
                          {getInitials(item.name)}
                        </div>
                        <div className="leaderboard-details">
                          <span className="leaderboard-name">{item.name}</span>
                          <span className="leaderboard-sub">
                            {leaderboardTab === 'students' || leaderboardTab === 'classes'
                              ? `Class ${item.class} • ${item.centreName} • Reg: ${item.reg}`
                              : `District: ${item.place} • Students: ${item.studentCount} • Total Points: ${item.totalScore || 0}`
                            }
                          </span>
                        </div>
                      </div>
                      <div className="leaderboard-right">
                        <span className="leaderboard-score-pill">
                          {leaderboardTab === 'centres' 
                            ? `Avg: ${item.score} pts` 
                            : `${item.score} pts`
                          }
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 5: REPORTS & PDF DOWNLOAD WINDOWS */}
        {/* ==================================================== */}
        {activeTab === 'reports' && (
          <div className="card animate-fade">
            <h3 className="card-title">Activity Reports Print Suite</h3>
            <div className="card-desc">Select a college to view their active month reports folder and print to PDF.</div>
            
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Choose Study Centre</label>
              <select 
                value={selectedReportCentre} 
                onChange={(e) => handleSelectReportCentre(e.target.value)}
                disabled={loadingReports}
              >
                <option value="">-- Choose Study Centre --</option>
                {studyCentres.map(sc => (
                  <option key={sc.id} value={sc.code}>
                    {sc.name} ({sc.code}) - {sc.district}
                  </option>
                ))}
              </select>
            </div>

            {loadingReports ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                Accessing reports directory...
              </div>
            ) : selectedReportCentre === '' ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                Please select a college from the list above.
              </div>
            ) : availableReportMonths.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                No activity reports have been uploaded by this study centre yet.
              </div>
            ) : (
              <div>
                <h4 style={{ color: 'var(--dark-text)', fontSize: '14px', fontWeight: '700', marginBottom: '12px' }}>
                  Available Months ({availableReportMonths.length})
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {availableReportMonths.map(m => (
                    <div 
                      key={m} 
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--bg-main)' }}
                    >
                      <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-main)' }}>
                        🗓️ Report Month: {m}
                      </span>
                      <button 
                        className="btn btn-secondary animate-slide" 
                        onClick={() => handleLoadPrintReport(m)}
                        style={{ padding: '8px 16px', fontSize: '12px' }}
                      >
                        📄 View & Print Report
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sticky Bottom Tab Bar for Admin mobile layouts */}
      <nav className="mobile-nav-bar">
        <button 
          className={`nav-item ${activeTab === 'status' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          <span className="nav-icon">📊</span>
          <span>Status Board</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'override' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('override')}
        >
          <span className="nav-icon">⚙️</span>
          <span>Access Controls</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'upload' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          <span className="nav-icon">📥</span>
          <span>Import Excel</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'leaderboard' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          <span className="nav-icon">🏆</span>
          <span>Rankings</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'reports' ? 'nav-item-active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <span className="nav-icon">🖨️</span>
          <span>Reports Suite</span>
        </button>
      </nav>
    </div>
  );
}

export default AdminDashboard;
