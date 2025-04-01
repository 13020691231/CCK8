document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsSection = document.getElementById('resultsSection');
    const chartContainer = document.getElementById('chartContainer');
    const conclusionsDiv = document.getElementById('conclusions');

    analyzeBtn.addEventListener('click', function() {
        if (!fileInput.files.length) {
        alert('请先选择文件');
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const data = e.target.result;
                processCCK8Data(data, file.name);
            } catch (error) {
                console.error('Error processing file:', error);
            alert('文件处理错误，请检查文件格式');
            }
        };

        if (file.name.endsWith('.csv')) {
            reader.readAsText(file);
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            if (typeof XLSX === 'undefined') {
            alert('Excel支持加载失败，请刷新页面重试');
                return;
            }
            reader.readAsArrayBuffer(file);
        } else {
            alert('不支持的文件格式，请使用CSV或Excel文件');
        }
    });

    function processCCK8Data(data, filename) {
        let parsedData;
        if (filename.endsWith('.csv')) {
            // Parse CSV data
            parsedData = parseCSV(data);
        } else {
            // Parse Excel data
            parsedData = parseExcel(data);
        }
        
        // Validate data structure
        if (!validateCCK8Data(parsedData)) {
            alert('CCK8数据格式无效，请检查文件');
            return;
        }

        // Calculate viability percentages
        const results = calculateViability(parsedData);

        // Display results
        displayResults(results, filename);
        resultsSection.style.display = 'block';
    }

    function parseCSV(csvData) {
        const lines = csvData.split('\n').filter(line => line.trim() !== '');
        const groupNames = lines[0].split(',').map(name => name.trim());
        const data = [];
        
        // Process each well (row)
        for (let row = 1; row < lines.length; row++) {
            const values = lines[row].split(',');
            
            // Create entry for each group
            groupNames.forEach((group, col) => {
                if (col >= values.length || !values[col].trim()) return;
                
                data.push({
                    Treatment: group,
                    OD450: values[col].trim()
                });
            });
        }
        
        return data;
    }

    function parseExcel(excelData) {
        try {
            // Parse Excel file using SheetJS
            const workbook = XLSX.read(excelData, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            
            console.log('Excel data parsed:', jsonData); // Debug log

            if (jsonData.length < 2) return [];

            const headers = jsonData[0].map(h => h.toString().trim());
            const data = [];
            
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0) continue;
                
                const entry = {};
                headers.forEach((header, index) => {
                    entry[header] = row[index] ? row[index].toString().trim() : '';
                });
                
                data.push(entry);
            }
        
            return data;
        } catch (error) {
            console.error('Error parsing Excel file:', error);
            alert('Error parsing Excel file. Please check the file format.');
            return [];
        }
    }

    function validateCCK8Data(data) {
        if (data.length === 0) return false;
        const sampleRow = data[0];
        return 'OD450' in sampleRow && 'Treatment' in sampleRow;
    }

    function calculateSD(values) {
        const avg = average(values);
        const squareDiffs = values.map(v => Math.pow(v - avg, 2));
        return Math.sqrt(average(squareDiffs));
    }

    function removeOutliers(values) {
        if (values.length <= 2) return values;
        
        const sorted = [...values].sort((a,b) => a - b);
        return sorted.slice(1, -1); // Remove first (min) and last (max)
    }

    function calculateViability(data) {
        // Group data by treatment
        const groups = {};
        data.forEach(row => {
            const treatment = row.Treatment.trim();
            if (!groups[treatment]) {
                groups[treatment] = [];
            }
            const od = parseFloat(row.OD450);
            if (!isNaN(od)) {
                groups[treatment].push(od);
            }
        });

        // Validate we have required groups
        if (!groups['Blank'] || !groups['Control']) {
            alert('缺少必要组别：必须提供空白组和对照组');
            return [];
        }

        // Calculate blank-adjusted OD values
        const blankAvg = average(groups['Blank']);
        const controlAvg = average(groups['Control']);
        
        const results = [];
        Object.keys(groups).forEach(treatment => {
            if (treatment === 'Blank') return;
            
            let odValues = groups[treatment];
            const sd = calculateSD(odValues);
            
            // Remove outliers if SD is too large (more than 20% of mean)
            if (sd > (average(odValues) * 0.2) && odValues.length > 2) {
                odValues = removeOutliers(odValues);
            }
            
            const blankAdjusted = odValues.map(od => od - blankAvg);
            const viability = treatment === 'Control' ? 
                100 : 
                (average(blankAdjusted) / (controlAvg - blankAvg)) * 100;

            results.push({
                treatment,
                odValues: odValues.map(v => v.toFixed(3)),
                blankAdjusted: blankAdjusted.map(v => v.toFixed(3)),
                meanOD: average(blankAdjusted).toFixed(3),
                viability: viability.toFixed(1) + '%',
                replicates: odValues.length,
                sd: sd.toFixed(3)
            });
        });

        return results;
    }

    function average(values) {
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    function displayResults(results, filename) {
        // Create results table
        let html = `<h3>${filename}的分析结果</h3>`;
        html += `<table class="results-table">
            <thead>
                <tr>
                    <th>处理组</th>
                    <th>原始OD值</th>
                    <th>空白校正OD</th>
                    <th>平均OD</th>
                    <th>细胞活性</th>
                    <th>重复数</th>
                    <th>标准差</th>
                </tr>
            </thead>
            <tbody>`;

        results.forEach(group => {
            html += `<tr>
                <td>${group.treatment}</td>
                <td>${group.odValues.join(', ')}</td>
                <td>${group.blankAdjusted.join(', ')}</td>
                <td>${group.meanOD}</td>
                <td>${group.viability}</td>
                <td>${group.replicates}</td>
                <td>${group.sd}</td>
            </tr>`;
        });

        html += `</tbody></table>`;
        conclusionsDiv.innerHTML = html;

        // Create chart
        const ctx = document.createElement('canvas');
        chartContainer.innerHTML = '';
        chartContainer.appendChild(ctx);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: results.map(r => r.treatment),
                datasets: [{
                    label: '细胞活性(%)',
                    data: results.map(r => parseFloat(r.viability)),
                    backgroundColor: results.map(r => 
                        r.treatment === 'Control' ? '#3498db' : '#2ecc71'
                    ),
                    borderColor: '#2c3e50',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                    text: '细胞活性(%)'
                        }
                    }
                }
            }
        });
    }
});
