const fetchUtilityBills = async () => {
  setLoading(true);
  try {
    if (!user) {
      return;
    }

    const userId = user.appUserId || user.id;
    const { data, error } = await supabase
      .from('utility_readings')
      .select(`
        id,
        utilitytype,
        previousreading,
        currentreading,
        readingdate,
        photourl,
        calculatedbill,
        status,
        is_meter_reset
      `)
      .eq('renteeid', userId)
      .order('readingdate', { ascending: false });

    if (error) {
      throw error;
    }

    const readingsWithProperties = await Promise.all(
      data.map(async (reading) => {
        // Fetch property details for each reading
        const { data: propData, error: propError } = await supabase
          .from('properties')
          .select('name, electricity_rate, water_rate')
          .eq('id', reading.propertyid)
          .single();

        if (propError) {
          console.error('Error fetching property:', propError);
        }

        return {
          ...reading,
          propertyName: propData?.name || 'Unknown property',
          rate: reading.utilitytype === UTILITY_TYPES.ELECTRICITY 
            ? propData?.electricity_rate 
            : propData?.water_rate
        };
      })
    );

    setUtilityBills(readingsWithProperties);
  } catch (error) {
    console.error('Error fetching utility bills:', error);
    toast.error('Failed to load utility bills');
  } finally {
    setLoading(false);
  }
};

{utilityBills.map((bill) => (
  <div key={bill.id} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500">
    <div className="flex justify-between items-start">
      <div>
        <h3 className="font-semibold text-lg">
          {bill.utilitytype === UTILITY_TYPES.ELECTRICITY ? '⚡ Electricity' : '💧 Water'} Reading
        </h3>
        <p className="text-gray-600 text-sm">{bill.propertyName}</p>
        <p className="text-gray-600 text-sm">
          Submitted on {new Date(bill.readingdate).toLocaleDateString()}
        </p>
      </div>
      <span className={`px-2 py-1 text-xs rounded-full ${
        bill.status === 'approved' 
          ? 'bg-green-100 text-green-800' 
          : bill.status === 'rejected'
            ? 'bg-red-100 text-red-800'
            : 'bg-yellow-100 text-yellow-800'
      }`}>
        {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
      </span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-4">
      <div>
        <p className="text-sm text-gray-500">Previous Reading</p>
        <p className="font-medium">{bill.previousreading || 'N/A'}</p>
      </div>
      <div>
        <p className="text-sm text-gray-500">Current Reading</p>
        <p className="font-medium">{bill.currentreading}</p>
      </div>
      
      <div>
        <p className="text-sm text-gray-500">Consumption</p>
        <p className="font-medium">{bill.calculatedbill} units</p>
      </div>
      <div>
        <p className="text-sm text-gray-500">Rate</p>
        <p className="font-medium">{bill.rate || 'N/A'}</p>
      </div>
    </div>
    
    {bill.is_meter_reset && (
      <div className="mt-2 p-2 bg-blue-50 text-blue-700 rounded text-sm">
        <p>Note: Meter was reset or replaced for this reading</p>
      </div>
    )}

    {bill.photourl && (
      <div className="mt-3">
        <button
          onClick={() => window.open(bill.photourl, '_blank')}
          className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
        >
          <span className="mr-1">📷</span> View Meter Photo
        </button>
      </div>
    )}
  </div>
))} 