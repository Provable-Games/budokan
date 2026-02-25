// import { useGetTournamentLeaderboard } from "@/dojo/hooks/useSqlQueries";
// import { useDojo } from "@/context/dojo";
// import { Tournament } from "@/generated/models.gen";
// import { useGameEndpoints } from "@/dojo/hooks/useGameEndpoints";
// import { useState } from "react";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";
// import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
// import { useAccount } from "@starknet-react/core";
// import { indexAddress } from "@/lib/utils";

// interface TournamentGamesProps {
//   tournament: Tournament;
// }

// const TournamentGames = ({ tournament }: TournamentGamesProps) => {
//   const { address } = useAccount();
//   const { namespace } = useDojo();
//   const [currentPage, _setCurrentPage] = useState(1);
//   const [scores, setScores] = useState<Record<string, number>>({});
//   const { endGame } = useSystemCalls();

//   const tournamentId = tournament.id;
//   const { gameNamespace, gameScoreModel, gameScoreAttribute } =
//     useGameEndpoints(tournament.game_config.address);

//   const { data: leaderboard } = useGetTournamentLeaderboard({
//     namespace: namespace,
//     tournamentId: tournamentId,
//     gameNamespace: gameNamespace ?? "",
//     gameScoreModel: gameScoreModel ?? "",
//     gameScoreAttribute: gameScoreAttribute ?? "",
//     gameAddress: indexAddress(tournament.game_config.address.toString()),
//     limit: 10,
//     offset: (currentPage - 1) * 5,
//   });

//   const handleScoreChange = (id: string, value: string) => {
//     setScores((prev) => ({
//       ...prev,
//       [id]: Number(value),
//     }));
//   };

//   return (
//     <div className="flex flex-col gap-5 px-4">
//       <span className="font-brand text-2xl">Games</span>
//       <div className="grid grid-cols-3 h-[300px] gap-5 overflow-y-auto">
//         {leaderboard?.map((entry, index) => (
//           <div key={index} className="flex flex-row items-center gap-10">
//             <div className="flex flex-row items-center gap-2">
//               <p className="text-brand-muted">Game</p>
//               <p>{Number(entry?.game_token_id).toString()}</p>
//             </div>
//             <div className="flex flex-row items-center gap-2">
//               {entry?.score === 0 ? (
//                 <Input
//                   type="number"
//                   value={scores[entry?.game_token_id?.toString() ?? ""]}
//                   onChange={(e) =>
//                     handleScoreChange(
//                       entry?.game_token_id?.toString() ?? "",
//                       e.target.value
//                     )
//                   }
//                   placeholder="Enter XP"
//                 />
//               ) : (
//                 <p>
//                   {entry?.score}
//                   XP
//                 </p>
//               )}
//               <Button
//                 onClick={() =>
//                   endGame(
//                     entry?.game_token_id?.toString() ?? "",
//                     scores[entry?.game_token_id?.toString() ?? ""]
//                   )
//                 }
//                 disabled={entry?.score > 0 || !address}
//               >
//                 End Game
//               </Button>
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// };

// export default TournamentGames;
