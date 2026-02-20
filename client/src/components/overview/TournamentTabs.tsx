import { TournamentTab } from "./TournamentTab";
import { GLOBE, FLAG, MINUS, TROPHY } from "@/components/Icons";

export type TabType = "upcoming" | "live" | "ended" | "my";

interface TournamentTabsProps {
  selectedTab: TabType;
  setSelectedTab: (tab: TabType) => void;
  upcomingTournamentsCount?: number;
  liveTournamentsCount?: number;
  endedTournamentsCount?: number;
  myTournamentsCount?: number;
}

const TournamentTabs = ({
  selectedTab,
  setSelectedTab,
  upcomingTournamentsCount,
  liveTournamentsCount,
  endedTournamentsCount,
  myTournamentsCount,
}: TournamentTabsProps) => {
  return (
    <div className="flex flex-row gap-2">
      <TournamentTab
        selected={selectedTab === "upcoming"}
        onClick={() => setSelectedTab("upcoming")}
        icon={<GLOBE />}
        label="Upcoming Tournaments"
        mobileLabel="Upcoming"
        count={upcomingTournamentsCount}
      />
      <TournamentTab
        selected={selectedTab === "live"}
        onClick={() => setSelectedTab("live")}
        icon={<FLAG />}
        label="Live Tournaments"
        mobileLabel="Live"
        count={liveTournamentsCount}
      />
      <TournamentTab
        selected={selectedTab === "ended"}
        onClick={() => setSelectedTab("ended")}
        icon={<MINUS />}
        label="Ended Tournaments"
        mobileLabel="Ended"
        count={endedTournamentsCount}
      />
      <div className="hidden sm:block">
        <TournamentTab
          selected={selectedTab === "my"}
          onClick={() => setSelectedTab("my")}
          icon={<TROPHY />}
          label="My Tournaments"
          mobileLabel="My Tournaments"
          count={myTournamentsCount}
        />
      </div>
    </div>
  );
};

export default TournamentTabs;
