import React, { useState, useEffect } from 'react';

const PerformanceMetrics = ({ assignments = [] }) => {
  const [metrics, setMetrics] = useState({
    totalAssignments: 0,
    completedAssignments: 0,
    pendingAssignments: 0,
    completionRate: 0,
    averageCompletionTime: 0,
    tasksByType: {}
  });
  
  // Calculate metrics based on assignments
  useEffect(() => {
    if (!assignments || assignments.length === 0) {
      return;
    }
    
    // Count assignments by status
    const completed = assignments.filter(a => a.status === 'completed');
    const pending = assignments.filter(a => a.status !== 'completed');
    
    // Calculate completion rate
    const completionRate = assignments.length > 0 
      ? (completed.length / assignments.length) * 100 
      : 0;
    
    // Calculate average completion time (in days)
    let totalCompletionTime = 0;
    let completedWithTime = 0;
    
    completed.forEach(assignment => {
      if (assignment.completedDate && assignment.assignmentDate) {
        const assignedDate = new Date(assignment.assignmentDate);
        const completedDate = new Date(assignment.completedDate);
        const timeDiff = completedDate - assignedDate;
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24); // Convert to days
        
        totalCompletionTime += daysDiff;
        completedWithTime++;
      }
    });
    
    const averageCompletionTime = completedWithTime > 0 
      ? totalCompletionTime / completedWithTime 
      : 0;
    
    // Count tasks by type
    const tasksByType = {};
    
    assignments.forEach(assignment => {
      const type = assignment.taskType || 'other';
      if (!tasksByType[type]) {
        tasksByType[type] = 0;
      }
      tasksByType[type]++;
    });
    
    // Update metrics
    setMetrics({
      totalAssignments: assignments.length,
      completedAssignments: completed.length,
      pendingAssignments: pending.length,
      completionRate,
      averageCompletionTime,
      tasksByType
    });
  }, [assignments]);
  
  // Get color for completion rate
  const getCompletionRateColor = (rate) => {
    if (rate >= 90) {
      return 'text-green-600';
    }
    if (rate >= 70) {
      return 'text-yellow-600';
    }
    return 'text-red-600';
  };
  
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Performance Metrics</h3>
      
      {assignments.length === 0 ? (
        <p className="text-gray-500">No assignments data available.</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 mb-1">Total Assignments</h4>
              <p className="text-2xl font-bold">{metrics.totalAssignments}</p>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 mb-1">Completion Rate</h4>
              <p className={`text-2xl font-bold ${getCompletionRateColor(metrics.completionRate)}`}>
                {metrics.completionRate.toFixed(0)}%
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 mb-1">Avg. Completion Time</h4>
              <p className="text-2xl font-bold">
                {metrics.averageCompletionTime.toFixed(1)} days
              </p>
            </div>
          </div>
          
          {/* Status Breakdown */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <h4 className="text-sm font-medium text-gray-500 mb-3">Assignment Status</h4>
            
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full bg-green-200 text-green-800">
                    Completed
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold inline-block text-green-800">
                    {metrics.completedAssignments} ({metrics.completionRate.toFixed(0)}%)
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200">
                <div 
                  style={{ width: `${metrics.completionRate}%` }} 
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"
                ></div>
              </div>
              
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full bg-blue-200 text-blue-800">
                    Pending
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold inline-block text-blue-800">
                    {metrics.pendingAssignments} ({(100 - metrics.completionRate).toFixed(0)}%)
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200">
                <div 
                  style={{ width: `${100 - metrics.completionRate}%` }} 
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500"
                ></div>
              </div>
            </div>
          </div>
          
          {/* Task Types */}
          {Object.keys(metrics.tasksByType).length > 0 && (
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 mb-3">Tasks by Type</h4>
              
              <div className="space-y-3">
                {Object.entries(metrics.tasksByType).map(([type, count]) => {
                  const percentage = (count / metrics.totalAssignments) * 100;
                  
                  return (
                    <div key={type}>
                      <div className="flex mb-1 items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full bg-gray-200 text-gray-800">
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold inline-block text-gray-800">
                            {count} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      <div className="overflow-hidden h-2 mb-1 text-xs flex rounded bg-gray-200">
                        <div 
                          style={{ width: `${percentage}%` }} 
                          className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500"
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PerformanceMetrics; 