import {
  GraphWidget,
  HorizontalAnnotation,
  IWidget,
} from "aws-cdk-lib/aws-cloudwatch";

import {
  BaseMonitoringProps,
  CountAxisFromZero,
  DefaultGraphWidgetHeight,
  DefaultSummaryWidgetHeight,
  HalfWidth,
  MetricWithAlarmSupport,
  Monitoring,
  MonitoringScope,
  PercentageAxisFromZeroToHundred,
  QuarterWidth,
  ThirdWidth,
  TimeAxisMillisFromZero,
  UsageAlarmFactory,
  UsageThreshold,
} from "../../common";
import {
  MonitoringHeaderWidget,
  MonitoringNamingStrategy,
} from "../../dashboard";
import {
  RdsClusterMetricFactory,
  RdsClusterMetricFactoryProps,
} from "./RdsClusterMetricFactory";

export interface RdsClusterMonitoringOptions extends BaseMonitoringProps {
  readonly addDiskSpaceUsageAlarm?: Record<string, UsageThreshold>;
  readonly addCpuUsageAlarm?: Record<string, UsageThreshold>;
}

export interface RdsClusterMonitoringProps
  extends RdsClusterMetricFactoryProps,
    RdsClusterMonitoringOptions {}

export class RdsClusterMonitoring extends Monitoring {
  readonly title: string;
  readonly url?: string;

  readonly usageAlarmFactory: UsageAlarmFactory;
  readonly usageAnnotations: HorizontalAnnotation[];

  readonly connectionsMetric: MetricWithAlarmSupport;
  readonly diskSpaceUsageMetric: MetricWithAlarmSupport;
  readonly cpuUsageMetric: MetricWithAlarmSupport;
  readonly selectLatencyMetric: MetricWithAlarmSupport;
  readonly insertLatencyMetric: MetricWithAlarmSupport;
  readonly updateLatencyMetric: MetricWithAlarmSupport;
  readonly deleteLatencyMetric: MetricWithAlarmSupport;
  readonly commitLatencyMetric: MetricWithAlarmSupport;

  constructor(scope: MonitoringScope, props: RdsClusterMonitoringProps) {
    super(scope, props);

    const metricFactory = new RdsClusterMetricFactory(
      scope.createMetricFactory(),
      props
    );
    this.connectionsMetric = metricFactory.metricTotalConnectionCount();
    this.diskSpaceUsageMetric = metricFactory.metricDiskSpaceUsageInPercent();
    this.cpuUsageMetric = metricFactory.metricAverageCpuUsageInPercent();
    this.selectLatencyMetric = metricFactory.metricSelectLatencyP90InMillis();
    this.insertLatencyMetric = metricFactory.metricInsertLatencyP90InMillis();
    this.updateLatencyMetric = metricFactory.metricUpdateLatencyP90InMillis();
    this.deleteLatencyMetric = metricFactory.metricDeleteLatencyP90InMillis();
    this.commitLatencyMetric = metricFactory.metricCommitLatencyP90InMillis();

    const namingStrategy = new MonitoringNamingStrategy({
      ...props,
      fallbackConstructName: metricFactory.clusterIdentifier,
      namedConstruct: props.cluster,
    });
    this.title = namingStrategy.resolveHumanReadableName();
    this.url = scope
      .createAwsConsoleUrlFactory()
      .getRdsClusterUrl(metricFactory.clusterIdentifier);
    const alarmFactory = this.createAlarmFactory(
      namingStrategy.resolveAlarmFriendlyName()
    );
    this.usageAlarmFactory = new UsageAlarmFactory(alarmFactory);
    this.usageAnnotations = [];

    for (const disambiguator in props.addDiskSpaceUsageAlarm) {
      const alarmProps = props.addDiskSpaceUsageAlarm[disambiguator];
      const createdAlarm = this.usageAlarmFactory.addMaxDiskUsagePercentAlarm(
        this.diskSpaceUsageMetric,
        alarmProps,
        disambiguator
      );
      this.usageAnnotations.push(createdAlarm.annotation);
      this.addAlarm(createdAlarm);
    }

    for (const disambiguator in props.addCpuUsageAlarm) {
      const alarmProps = props.addCpuUsageAlarm[disambiguator];
      const createdAlarm = this.usageAlarmFactory.addMaxCpuUsagePercentAlarm(
        this.cpuUsageMetric,
        alarmProps,
        disambiguator
      );
      this.usageAnnotations.push(createdAlarm.annotation);
      this.addAlarm(createdAlarm);
    }

    props.useCreatedAlarms?.consume(this.createdAlarms());
  }

  summaryWidgets(): IWidget[] {
    return [
      this.createTitleWidget(),
      this.createCpuAndDiskUsageWidget(ThirdWidth, DefaultSummaryWidgetHeight),
      this.createConnectionsWidget(ThirdWidth, DefaultSummaryWidgetHeight),
      this.createLatencyWidget(ThirdWidth, DefaultSummaryWidgetHeight),
    ];
  }

  widgets(): IWidget[] {
    return [
      this.createTitleWidget(),
      this.createCpuAndDiskUsageWidget(QuarterWidth, DefaultGraphWidgetHeight),
      this.createConnectionsWidget(QuarterWidth, DefaultGraphWidgetHeight),
      this.createLatencyWidget(HalfWidth, DefaultGraphWidgetHeight),
    ];
  }

  createTitleWidget() {
    return new MonitoringHeaderWidget({
      family: "RDS Cluster",
      title: this.title,
      goToLinkUrl: this.url,
    });
  }

  createCpuAndDiskUsageWidget(width: number, height: number) {
    return new GraphWidget({
      width,
      height,
      title: "CPU/Disk Usage",
      left: [this.cpuUsageMetric, this.diskSpaceUsageMetric],
      leftYAxis: PercentageAxisFromZeroToHundred,
      leftAnnotations: this.usageAnnotations,
    });
  }

  createConnectionsWidget(width: number, height: number) {
    return new GraphWidget({
      width,
      height,
      title: "Connections",
      left: [this.connectionsMetric],
      leftYAxis: CountAxisFromZero,
    });
  }

  createLatencyWidget(width: number, height: number) {
    return new GraphWidget({
      width,
      height,
      title: "Query Duration",
      left: [
        this.selectLatencyMetric,
        this.insertLatencyMetric,
        this.updateLatencyMetric,
        this.deleteLatencyMetric,
        this.commitLatencyMetric,
      ],
      leftYAxis: TimeAxisMillisFromZero,
    });
  }
}
