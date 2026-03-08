"""
DRS.VIP-AI Prediction Engine Module
Advanced predictive analytics with time series forecasting and anomaly detection
"""

import asyncio
import json
import logging
import math
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import numpy as np

logger = logging.getLogger(__name__)


class PredictionType(Enum):
    """Types of predictions"""
    TIME_SERIES = "time_series"
    CLASSIFICATION = "classification"
    REGRESSION = "regression"
    ANOMALY = "anomaly"
    TREND = "trend"
    SEASONALITY = "seasonality"


class MetricType(Enum):
    """Types of metrics to predict"""
    CPU_USAGE = "cpu_usage"
    MEMORY_USAGE = "memory_usage"
    NETWORK_TRAFFIC = "network_traffic"
    REQUEST_RATE = "request_rate"
    RESPONSE_TIME = "response_time"
    ERROR_RATE = "error_rate"
    USER_ACTIVITY = "user_activity"
    RESOURCE_UTILIZATION = "resource_utilization"
    CUSTOM = "custom"


class AlertSeverity(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class DataPoint:
    """Single data point for time series"""
    timestamp: float
    value: float
    metadata: Dict = field(default_factory=dict)


@dataclass
class PredictionResult:
    """Result of a prediction"""
    prediction_type: PredictionType
    metric_type: MetricType
    predicted_value: float
    confidence: float
    timestamp: float
    horizon: float  # Prediction horizon in seconds
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    metadata: Dict = field(default_factory=dict)


@dataclass
class AnomalyResult:
    """Anomaly detection result"""
    is_anomaly: bool
    score: float
    expected_value: float
    actual_value: float
    deviation: float
    timestamp: float
    severity: AlertSeverity
    metadata: Dict = field(default_factory=dict)


@dataclass
class TrendResult:
    """Trend analysis result"""
    direction: str  # "up", "down", "stable"
    strength: float
    slope: float
    r_squared: float
    start_value: float
    end_value: float
    duration_seconds: float
    metadata: Dict = field(default_factory=dict)


@dataclass
class AlertRule:
    """Alert rule configuration"""
    id: str
    name: str
    metric_type: MetricType
    condition: str  # "above", "below", "change_rate", "anomaly"
    threshold: float
    duration_seconds: float = 0
    severity: AlertSeverity = AlertSeverity.WARNING
    enabled: bool = True
    cooldown_seconds: float = 300
    last_triggered: Optional[float] = None
    metadata: Dict = field(default_factory=dict)


class ExponentialSmoothing:
    """Exponential smoothing for time series forecasting"""
    
    def __init__(
        self,
        alpha: float = 0.3,
        beta: float = 0.1,
        gamma: float = 0.1,
        seasonal_periods: int = 0
    ):
        self.alpha = alpha  # Level smoothing
        self.beta = beta    # Trend smoothing
        self.gamma = gamma  # Seasonal smoothing
        self.seasonal_periods = seasonal_periods
        
        self.level: Optional[float] = None
        self.trend: Optional[float] = None
        self.seasonal: List[float] = []
        self._initialized = False
    
    def fit(self, data: List[float]) -> 'ExponentialSmoothing':
        """Fit the model to historical data"""
        if len(data) < 2:
            return self
        
        n = len(data)
        
        # Initialize level
        self.level = data[0]
        
        # Initialize trend
        self.trend = data[1] - data[0]
        
        # Initialize seasonal
        if self.seasonal_periods > 0 and n >= self.seasonal_periods:
            seasonal_avg = sum(data[:self.seasonal_periods]) / self.seasonal_periods
            self.seasonal = [
                data[i] - seasonal_avg
                for i in range(self.seasonal_periods)
            ]
        
        # Update with all data points
        for i in range(1, n):
            self._update(data[i], i)
        
        self._initialized = True
        return self
    
    def _update(self, value: float, index: int):
        """Update smoothing parameters with new value"""
        old_level = self.level
        old_trend = self.trend
        
        # Update level
        self.level = self.alpha * value + (1 - self.alpha) * (old_level + old_trend)
        
        # Update trend
        self.trend = self.beta * (self.level - old_level) + (1 - self.beta) * old_trend
        
        # Update seasonal
        if self.seasonal_periods > 0:
            seasonal_idx = index % self.seasonal_periods
            if len(self.seasonal) > seasonal_idx:
                self.seasonal[seasonal_idx] = (
                    self.gamma * (value - old_level - old_trend) +
                    (1 - self.gamma) * self.seasonal[seasonal_idx]
                )
    
    def predict(self, steps: int = 1) -> List[float]:
        """Predict future values"""
        if not self._initialized:
            return [0.0] * steps
        
        predictions = []
        for h in range(1, steps + 1):
            forecast = self.level + h * self.trend
            
            if self.seasonal_periods > 0 and len(self.seasonal) > 0:
                seasonal_idx = (len(self.seasonal) + h - 1) % self.seasonal_periods
                forecast += self.seasonal[seasonal_idx]
            
            predictions.append(forecast)
        
        return predictions
    
    def update(self, value: float) -> float:
        """Update model with new value and return next prediction"""
        if not self._initialized:
            self.level = value
            self.trend = 0
            self._initialized = True
            return value
        
        self._update(value, len(self.seasonal) + 1)
        return self.predict(1)[0]


class MovingAverage:
    """Moving average with multiple window sizes"""
    
    def __init__(self, window_sizes: List[int] = None):
        self.window_sizes = window_sizes or [5, 10, 20]
        self.windows: Dict[int, deque] = {
            size: deque(maxlen=size) for size in self.window_sizes
        }
    
    def add(self, value: float):
        """Add a new value to all windows"""
        for window in self.windows.values():
            window.append(value)
    
    def get_average(self, window_size: int) -> Optional[float]:
        """Get average for a specific window size"""
        window = self.windows.get(window_size)
        if window and len(window) > 0:
            return sum(window) / len(window)
        return None
    
    def get_all_averages(self) -> Dict[int, Optional[float]]:
        """Get averages for all window sizes"""
        return {
            size: self.get_average(size)
            for size in self.window_sizes
        }
    
    def detect_crossover(self) -> Optional[str]:
        """Detect moving average crossover signals"""
        if len(self.window_sizes) < 2:
            return None
        
        sorted_sizes = sorted(self.window_sizes)
        short_ma = self.get_average(sorted_sizes[0])
        long_ma = self.get_average(sorted_sizes[-1])
        
        if short_ma is None or long_ma is None:
            return None
        
        if short_ma > long_ma:
            return "bullish"
        elif short_ma < long_ma:
            return "bearish"
        return "neutral"


class AnomalyDetector:
    """Statistical anomaly detection"""
    
    def __init__(
        self,
        method: str = "zscore",
        threshold: float = 3.0,
        window_size: int = 100
    ):
        self.method = method
        self.threshold = threshold
        self.window_size = window_size
        self.values: deque = deque(maxlen=window_size)
        self._stats: Dict = {}
    
    def add(self, value: float) -> AnomalyResult:
        """Add value and check for anomaly"""
        is_anomaly = False
        score = 0.0
        expected = 0.0
        
        if len(self.values) >= 10:
            expected, score, is_anomaly = self._detect(value)
        
        self.values.append(value)
        self._update_stats()
        
        deviation = abs(value - expected) if expected != 0 else 0
        
        severity = AlertSeverity.INFO
        if score > self.threshold * 2:
            severity = AlertSeverity.CRITICAL
        elif score > self.threshold:
            severity = AlertSeverity.WARNING
        
        return AnomalyResult(
            is_anomaly=is_anomaly,
            score=score,
            expected_value=expected,
            actual_value=value,
            deviation=deviation,
            timestamp=time.time(),
            severity=severity
        )
    
    def _detect(self, value: float) -> Tuple[float, float, bool]:
        """Detect if value is anomalous"""
        values_list = list(self.values)
        
        if self.method == "zscore":
            return self._zscore_detect(value, values_list)
        elif self.method == "iqr":
            return self._iqr_detect(value, values_list)
        elif self.method == "mad":
            return self._mad_detect(value, values_list)
        else:
            return self._zscore_detect(value, values_list)
    
    def _zscore_detect(
        self,
        value: float,
        values: List[float]
    ) -> Tuple[float, float, bool]:
        """Z-score based anomaly detection"""
        mean = np.mean(values)
        std = np.std(values)
        
        if std == 0:
            return mean, 0, False
        
        z_score = abs(value - mean) / std
        return mean, z_score, z_score > self.threshold
    
    def _iqr_detect(
        self,
        value: float,
        values: List[float]
    ) -> Tuple[float, float, bool]:
        """IQR based anomaly detection"""
        q1 = np.percentile(values, 25)
        q3 = np.percentile(values, 75)
        iqr = q3 - q1
        
        lower_bound = q1 - self.threshold * iqr
        upper_bound = q3 + self.threshold * iqr
        
        median = np.median(values)
        distance = max(value - upper_bound, lower_bound - value, 0)
        score = distance / iqr if iqr > 0 else 0
        
        return median, score, value < lower_bound or value > upper_bound
    
    def _mad_detect(
        self,
        value: float,
        values: List[float]
    ) -> Tuple[float, float, bool]:
        """Median Absolute Deviation based detection"""
        median = np.median(values)
        mad = np.median([abs(v - median) for v in values])
        
        if mad == 0:
            return median, 0, False
        
        modified_z = 0.6745 * (value - median) / mad
        return median, abs(modified_z), abs(modified_z) > self.threshold
    
    def _update_stats(self):
        """Update internal statistics"""
        if len(self.values) < 2:
            return
        
        values_list = list(self.values)
        self._stats = {
            "mean": np.mean(values_list),
            "std": np.std(values_list),
            "min": np.min(values_list),
            "max": np.max(values_list),
            "median": np.median(values_list),
            "q1": np.percentile(values_list, 25),
            "q3": np.percentile(values_list, 75)
        }
    
    def get_stats(self) -> Dict:
        """Get current statistics"""
        return self._stats.copy()


class TrendAnalyzer:
    """Analyze trends in time series data"""
    
    def __init__(self, min_points: int = 10):
        self.min_points = min_points
        self.values: deque = deque(maxlen=1000)
        self.timestamps: deque = deque(maxlen=1000)
    
    def add(self, value: float, timestamp: Optional[float] = None):
        """Add a data point"""
        self.values.append(value)
        self.timestamps.append(timestamp or time.time())
    
    def analyze(self) -> Optional[TrendResult]:
        """Analyze current trend"""
        if len(self.values) < self.min_points:
            return None
        
        values = list(self.values)
        timestamps = list(self.timestamps)
        
        # Normalize timestamps
        t_min = min(timestamps)
        t_normalized = [(t - t_min) for t in timestamps]
        
        # Linear regression
        n = len(values)
        sum_t = sum(t_normalized)
        sum_v = sum(values)
        sum_tv = sum(t * v for t, v in zip(t_normalized, values))
        sum_t2 = sum(t * t for t in t_normalized)
        
        denominator = n * sum_t2 - sum_t * sum_t
        if denominator == 0:
            return None
        
        slope = (n * sum_tv - sum_t * sum_v) / denominator
        intercept = (sum_v - slope * sum_t) / n
        
        # Calculate R-squared
        v_mean = sum_v / n
        ss_tot = sum((v - v_mean) ** 2 for v in values)
        ss_res = sum((v - (slope * t + intercept)) ** 2 for v, t in zip(values, t_normalized))
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        
        # Determine direction
        if slope > 0.001:
            direction = "up"
        elif slope < -0.001:
            direction = "down"
        else:
            direction = "stable"
        
        # Calculate strength (0-1)
        strength = min(1.0, abs(slope) * 10)
        
        return TrendResult(
            direction=direction,
            strength=strength,
            slope=slope,
            r_squared=r_squared,
            start_value=values[0],
            end_value=values[-1],
            duration_seconds=timestamps[-1] - timestamps[0]
        )


class ForecastEngine:
    """Time series forecasting engine"""
    
    def __init__(self):
        self.exponential_smoothing = ExponentialSmoothing()
        self.models: Dict[str, ExponentialSmoothing] = {}
        self.history: Dict[str, List[DataPoint]] = {}
    
    def add_data(
        self,
        metric_id: str,
        value: float,
        timestamp: Optional[float] = None
    ):
        """Add data point for a metric"""
        if metric_id not in self.history:
            self.history[metric_id] = []
            self.models[metric_id] = ExponentialSmoothing()
        
        point = DataPoint(timestamp=timestamp or time.time(), value=value)
        self.history[metric_id].append(point)
        
        # Update model
        self.models[metric_id].update(value)
    
    def forecast(
        self,
        metric_id: str,
        horizon: int = 10
    ) -> List[PredictionResult]:
        """Generate forecast for a metric"""
        if metric_id not in self.models:
            return []
        
        model = self.models[metric_id]
        predictions = model.predict(horizon)
        history = self.history.get(metric_id, [])
        
        results = []
        now = time.time()
        
        # Calculate confidence based on historical variance
        if len(history) > 1:
            values = [p.value for p in history[-100:]]
            std = np.std(values)
            mean = np.mean(values)
            cv = std / mean if mean != 0 else 0
            base_confidence = max(0.5, min(0.95, 1 - cv))
        else:
            base_confidence = 0.5
            std = 0
        
        for i, pred in enumerate(predictions):
            # Confidence decreases with horizon
            confidence = base_confidence * (0.95 ** i)
            
            # Prediction intervals
            interval_width = std * (1 + i * 0.1)
            
            results.append(PredictionResult(
                prediction_type=PredictionType.TIME_SERIES,
                metric_type=MetricType.CUSTOM,
                predicted_value=pred,
                confidence=confidence,
                timestamp=now,
                horizon=(i + 1) * 60,  # Assume 1-minute intervals
                lower_bound=pred - interval_width,
                upper_bound=pred + interval_width,
                metadata={"step": i + 1}
            ))
        
        return results
    
    def get_trend(self, metric_id: str) -> Optional[str]:
        """Get current trend direction"""
        if metric_id not in self.history or len(self.history[metric_id]) < 10:
            return None
        
        values = [p.value for p in self.history[metric_id][-20:]]
        
        # Simple trend: compare first half to second half
        mid = len(values) // 2
        first_half_avg = sum(values[:mid]) / mid
        second_half_avg = sum(values[mid:]) / (len(values) - mid)
        
        if second_half_avg > first_half_avg * 1.05:
            return "increasing"
        elif second_half_avg < first_half_avg * 0.95:
            return "decreasing"
        return "stable"


class PredictionEngine:
    """Main prediction orchestration engine"""
    
    def __init__(self):
        self.forecast = ForecastEngine()
        self.anomaly_detectors: Dict[str, AnomalyDetector] = {}
        self.trend_analyzers: Dict[str, TrendAnalyzer] = {}
        self.moving_averages: Dict[str, MovingAverage] = {}
        self.alert_rules: Dict[str, AlertRule] = {}
        self.alert_callbacks: List[Callable] = []
        self._running = False
        self._task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the prediction engine"""
        self._running = True
        logger.info("Prediction engine started")
    
    async def stop(self):
        """Stop the prediction engine"""
        self._running = False
        if self._task:
            self._task.cancel()
        logger.info("Prediction engine stopped")
    
    def register_metric(
        self,
        metric_id: str,
        metric_type: MetricType,
        anomaly_threshold: float = 3.0
    ):
        """Register a metric for tracking"""
        if metric_id not in self.anomaly_detectors:
            self.anomaly_detectors[metric_id] = AnomalyDetector(
                threshold=anomaly_threshold
            )
            self.trend_analyzers[metric_id] = TrendAnalyzer()
            self.moving_averages[metric_id] = MovingAverage()
            logger.info(f"Registered metric: {metric_id}")
    
    def add_data_point(
        self,
        metric_id: str,
        value: float,
        timestamp: Optional[float] = None
    ) -> Dict:
        """Add a data point and run all analyses"""
        timestamp = timestamp or time.time()
        result = {
            "metric_id": metric_id,
            "value": value,
            "timestamp": timestamp,
            "anomaly": None,
            "trend": None,
            "forecast": None
        }
        
        # Add to forecast engine
        self.forecast.add_data(metric_id, value, timestamp)
        
        # Check for anomaly
        if metric_id in self.anomaly_detectors:
            anomaly = self.anomaly_detectors[metric_id].add(value)
            result["anomaly"] = anomaly
            
            if anomaly.is_anomaly:
                await self._handle_anomaly(metric_id, anomaly)
        
        # Update trend
        if metric_id in self.trend_analyzers:
            self.trend_analyzers[metric_id].add(value, timestamp)
            trend = self.trend_analyzers[metric_id].analyze()
            result["trend"] = trend
        
        # Update moving averages
        if metric_id in self.moving_averages:
            self.moving_averages[metric_id].add(value)
        
        # Check alert rules
        self._check_alerts(metric_id, value, timestamp)
        
        return result
    
    async def _handle_anomaly(self, metric_id: str, anomaly: AnomalyResult):
        """Handle detected anomaly"""
        logger.warning(
            f"Anomaly detected for {metric_id}: "
            f"value={anomaly.actual_value:.2f}, "
            f"expected={anomaly.expected_value:.2f}, "
            f"score={anomaly.score:.2f}"
        )
        
        # Notify alert callbacks
        for callback in self.alert_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback({
                        "type": "anomaly",
                        "metric_id": metric_id,
                        "anomaly": anomaly
                    })
                else:
                    callback({
                        "type": "anomaly",
                        "metric_id": metric_id,
                        "anomaly": anomaly
                    })
            except Exception as e:
                logger.error(f"Alert callback error: {e}")
    
    def add_alert_rule(self, rule: AlertRule):
        """Add an alert rule"""
        self.alert_rules[rule.id] = rule
        logger.info(f"Added alert rule: {rule.name}")
    
    def remove_alert_rule(self, rule_id: str) -> bool:
        """Remove an alert rule"""
        if rule_id in self.alert_rules:
            del self.alert_rules[rule_id]
            return True
        return False
    
    def _check_alerts(self, metric_id: str, value: float, timestamp: float):
        """Check if any alert rules are triggered"""
        for rule in self.alert_rules.values():
            if not rule.enabled:
                continue
            
            # Check cooldown
            if rule.last_triggered:
                if timestamp - rule.last_triggered < rule.cooldown_seconds:
                    continue
            
            triggered = False
            
            if rule.condition == "above" and value > rule.threshold:
                triggered = True
            elif rule.condition == "below" and value < rule.threshold:
                triggered = True
            elif rule.condition == "anomaly":
                detector = self.anomaly_detectors.get(metric_id)
                if detector and detector.get_stats():
                    stats = detector.get_stats()
                    if value > stats.get("mean", 0) + rule.threshold * stats.get("std", 1):
                        triggered = True
            
            if triggered:
                rule.last_triggered = timestamp
                self._trigger_alert(rule, metric_id, value)
    
    def _trigger_alert(self, rule: AlertRule, metric_id: str, value: float):
        """Trigger an alert"""
        logger.warning(
            f"Alert triggered: {rule.name} "
            f"[{rule.severity.value}] "
            f"for {metric_id} = {value}"
        )
        
        # This would normally send notifications
        # For now, just log it
    
    def add_alert_callback(self, callback: Callable):
        """Add a callback for alerts"""
        self.alert_callbacks.append(callback)
    
    def get_forecast(
        self,
        metric_id: str,
        horizon: int = 10
    ) -> List[PredictionResult]:
        """Get forecast for a metric"""
        return self.forecast.forecast(metric_id, horizon)
    
    def get_trend(self, metric_id: str) -> Optional[TrendResult]:
        """Get trend analysis for a metric"""
        if metric_id in self.trend_analyzers:
            return self.trend_analyzers[metric_id].analyze()
        return None
    
    def get_anomaly_stats(self, metric_id: str) -> Dict:
        """Get anomaly statistics for a metric"""
        if metric_id in self.anomaly_detectors:
            return self.anomaly_detectors[metric_id].get_stats()
        return {}
    
    def get_moving_averages(self, metric_id: str) -> Dict[int, Optional[float]]:
        """Get moving averages for a metric"""
        if metric_id in self.moving_averages:
            return self.moving_averages[metric_id].get_all_averages()
        return {}
    
    def get_status(self) -> Dict:
        """Get engine status"""
        return {
            "running": self._running,
            "metrics_tracked": len(self.anomaly_detectors),
            "alert_rules": len(self.alert_rules),
            "active_forecasts": len(self.forecast.history)
        }


# Export classes
__all__ = [
    "PredictionEngine",
    "ForecastEngine",
    "AnomalyDetector",
    "TrendAnalyzer",
    "MovingAverage",
    "ExponentialSmoothing",
    "PredictionType",
    "MetricType",
    "AlertSeverity",
    "DataPoint",
    "PredictionResult",
    "AnomalyResult",
    "TrendResult",
    "AlertRule"
]