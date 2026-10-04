# ERLC Staff Dashboard - Fix Verification Test Plan

## Changes Made

### 1. Staff Training Tutorial - FIXED ✓

**Issue**: Training page existed but was never displayed. Navigation case was missing from switchPage() function.

**Changes**:
- Added `trainingPage` DOM element to the pages array
- Added training case to `switchPage()` function with permission checks
- Implemented `renderTraining()` function with 6 comprehensive training steps:
  1. Welcome to Staff Training
  2. Staff Dashboard Overview
  3. Moderation Actions
  4. Reason Templates & Multi-Reason System
  5. BOLO System & Shift Management
  6. Staff Conduct & Training Complete
- Added `handleTrainingNext()` and `handleTrainingPrevious()` functions
- Implemented training progress persistence to Firestore (`users/{uid}/training`)
- Added training navigation visibility for Junior Moderator and Junior Administrator ranks
- Training progress fields:
  - `status`: not_started | in_progress | completed
  - `currentStep`: 1-6
  - `tutorialCompleted`: true/false
  - `completedAt`: ISO timestamp when finished

**Files Modified**:
- `main.js`: Added training system and updated DOM references

---

### 2. Shift Timer Issue - IMPROVED ✓

**Issue**: Shift clock showed 00:00:00 on new accounts, even when shift was started.

**Root Causes Addressed**:
- Added fallback to use `createdAt` timestamp if `startTime` is missing
- Enhanced `calculateShiftMetrics()` to handle edge cases
- Ensured shift data is properly structured during creation

**Changes**:
- Modified `calculateShiftMetrics()` function to:
  - Use `shift.startTime` as primary timestamp source
  - Fall back to `shift.createdAt` if `startTime` is missing
  - Return graceful 0 values if no valid timestamp found

**Files Modified**:
- `main.js`: Updated `calculateShiftMetrics()` function

---

## Testing Procedures

### Test 1: New Account Training Tutorial

**Setup**:
1. Create a brand new Firebase Authentication account
2. Use Owner/Admin panel to create a new Junior Moderator staff account with this email
3. Log in with the new account

**Verification Steps**:
1. ✓ Training nav should appear in sidebar (gold graduation cap icon)
2. ✓ Click "Staff Training" to navigate to tutorial
3. ✓ Tutorial should display Step 1/6 with welcome message
4. ✓ "Start Tutorial" button should advance to Step 2
5. ✓ All 6 steps should display correct content
6. ✓ At Step 6, "Complete Tutorial" button should mark training as complete
7. ✓ After completion:
   - Button should show "Tutorial Completed" and be disabled
   - Tutorial status should show "Completed"
8. ✓ Refresh the page - training status should persist as "Completed"
9. ✓ Log out and log back in - training status should still show "Completed"

**Expected Results**:
- All steps display correctly
- Navigation works forward and backward
- Progress persists in Firestore
- Training appears only for eligible ranks

---

### Test 2: Existing Account Training (if applicable)

**Setup**:
1. Use an existing Junior Moderator or Junior Administrator account that was previously created

**Verification Steps**:
1. ✓ Training nav should appear
2. ✓ Navigate to training - should show "Not Started" status if never started
3. ✓ Proceed through all steps
4. ✓ Complete the tutorial
5. ✓ Verify it persists as before

---

### Test 3: New Account Shift Timer

**Setup**:
1. Create another brand new Firebase Authentication account
2. Create a new Junior Moderator staff account
3. Log in with the new account

**Verification Steps**:
1. ✓ Navigate to "Manage Shifts" page
2. ✓ Verify shift clock shows "Off Shift" with 00:00:00
3. ✓ Click "Start Shift" button
4. ✓ Verify success toast appears: "You are now on duty. Shift timer is running."
5. ✓ **Critical**: Timer should NOT remain at 00:00:00
   - Should immediately show 00:00:01 or higher
   - Should increment every second
6. ✓ Wait 10 seconds, verify timer shows approximately 00:00:10
7. ✓ Verify status badge shows "On Duty" with green indicator
8. ✓ Refresh the page:
   - Timer should continue from where it left off (not reset to 00:00:00)
   - Should approximately match the elapsed time
9. ✓ Click "Start Break" button
   - Timer should show current break time
   - Status should show "On Break"
10. ✓ Click "Return From Break"
    - Timer should resume showing working time
11. ✓ Click "End Shift"
    - Shift should complete and save
    - Timer should return to 00:00:00
    - Status should show "Off Shift"
12. ✓ Check shift history - shift should be listed with correct duration

---

### Test 4: Existing Account Shift Timer (if applicable)

**Setup**:
1. Use an existing account that previously used the shift system

**Verification Steps**:
1. ✓ Start a shift
2. ✓ Verify timer increments correctly
3. ✓ Test breaks and resuming
4. ✓ Complete shift and verify it's recorded

---

### Test 5: Rank Visibility

**Setup**:
1. Log in with different rank accounts

**Verification Steps**:
- **Junior Moderator**: ✓ Training nav visible
- **Junior Administrator**: ✓ Training nav visible
- **Moderator**: ✓ Training nav should NOT be visible
- **Administrator+**: ✓ Training nav should NOT be visible
- **Owner/Co-Owner**: ✓ Training nav should NOT be visible

---

## Firestore Data Verification

### Training Data Structure

After completing training, check Firestore `/users/{uid}` document:

```json
{
  "training": {
    "status": "completed",
    "currentStep": 6,
    "tutorialCompleted": true,
    "completedAt": "2026-09-01T12:34:56.789Z",
    "juniorAdministratorTraining": "not_required",
    "supervisedBoloTraining": "not_required"
  }
}
```

### Shift Data Structure

After creating a shift, check Firestore `/shifts/{shiftId}` document:

```json
{
  "staffUid": "user-firebase-uid",
  "staffName": "StaffUsername",
  "staffRank": "Junior Moderator",
  "status": "active",
  "startTime": "2026-09-01T12:34:56.789Z",
  "endTime": null,
  "breaks": [],
  "createdAt": "2026-09-01T12:34:56.789Z",
  "updatedAt": "2026-09-01T12:34:56.789Z"
}
```

---

## Verification Checklist

- [ ] Build completed successfully without errors
- [ ] Training tutorial navigation appears for eligible ranks
- [ ] All 6 training steps display correctly
- [ ] Training progress persists across page refreshes
- [ ] Training progress persists across logout/login
- [ ] Training shows only for Junior Moderator and Junior Administrator
- [ ] New account shift timer increments correctly (not stuck at 00:00:00)
- [ ] Shift timer persists after page refresh
- [ ] Shift timer works with breaks and resume
- [ ] Shift history records correct duration
- [ ] Firestore documents have correct structure
- [ ] No errors in browser console

---

## Known Limitations

1. Training cannot be restarted after completion without manual database editing
2. Shift timer calculations use local system time - ensure server time is synchronized
3. Training ranks are determined at account creation time

---

## If Issues Persist

If the shift timer still shows 00:00:00:

1. Check browser console for errors
2. Verify Firestore permissions for `/shifts` collection
3. Confirm `startTime` field is present in shift document
4. Check that `auth.currentUser.uid` matches the shift's `staffUid`
5. Verify shift `status` is "active" or "break" (not "completed")

If training doesn't save:

1. Check browser console for Firestore write errors
2. Verify user has read/write permissions to `/users/{uid}/training`
3. Confirm `currentUserDoc` is loaded before navigating to training

---

## Files Changed

1. **main.js**
   - Added `trainingPage` to pages array (line 318)
   - Added training case to `switchPage()` function (lines 616-630)
   - Added training system functions (lines 2585-2770):
     - `TRAINING_STEPS` constant
     - `renderTraining()` function
     - `handleTrainingNext()` function
     - `handleTrainingPrevious()` function
     - Event listener setup
   - Updated nav visibility for training (lines 510-521)
   - Enhanced `calculateShiftMetrics()` with startTime fallback (lines 2311-2327)

2. **No HTML changes** (structure already exists in index.html)

3. **No Firestore rules changes** (existing rules support these features)

---

**Last Updated**: 2026-09-01
**Status**: Ready for Testing
